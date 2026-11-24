from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.classroom import Classroom, ClassroomEnrollment
from app.models.organization import Organization, OrganizationMembership
from app.models.question_list import Question, QuestionList, QuestionListUnlock
from app.models.submission import RetakeAuthorization, Submission, SubmissionAnswer
from app.models.topic import Topic
from app.models.user import User


@dataclass(frozen=True)
class QuestionSeed:
    topic_slug: str
    statement: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_option: str
    explanation: str


def _get_or_create_user(db: Session, name: str, email: str, password: str, role: str) -> User:
    normalized_email = email.strip().lower()
    user = db.scalar(select(User).where(User.email == normalized_email))
    if user is not None:
        return user
    user = User(
        name=name,
        email=normalized_email,
        password_hash=hash_password(password),
        role=role,
    )
    db.add(user)
    db.flush()
    return user


def _get_or_create_topic(db: Session, name: str, slug: str, description: str) -> Topic:
    topic = db.scalar(select(Topic).where(Topic.slug == slug))
    if topic is not None:
        return topic
    topic = Topic(name=name, slug=slug, description=description)
    db.add(topic)
    db.flush()
    return topic


def _get_or_create_organization(
    db: Session,
    owner: User,
    name: str,
    description: str,
    visibility: str = "public",
    access_code: str | None = None,
) -> Organization:
    org = db.scalar(
        select(Organization).where(
            Organization.owner_teacher_id == owner.id,
            Organization.name == name,
        )
    )
    if org is not None:
        return org
    org = Organization(
        owner_teacher_id=owner.id,
        name=name,
        description=description,
        visibility=visibility,
        access_code=access_code if visibility == "private" else None,
    )
    db.add(org)
    db.flush()
    return org


def _ensure_org_membership(
    db: Session,
    org: Organization,
    user: User,
    member_role: str,
) -> OrganizationMembership:
    existing = db.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == org.id,
            OrganizationMembership.user_id == user.id,
        )
    )
    if existing is not None:
        return existing
    membership = OrganizationMembership(
        organization_id=org.id,
        user_id=user.id,
        member_role=member_role,
    )
    db.add(membership)
    db.flush()
    return membership


def _get_or_create_classroom(
    db: Session,
    teacher: User,
    name: str,
    description: str,
    *,
    organization: Organization | None = None,
    visibility: str = "public",
    access_code: str | None = None,
) -> Classroom:
    classroom = db.scalar(
        select(Classroom).where(Classroom.teacher_id == teacher.id, Classroom.name == name)
    )
    if classroom is not None:
        return classroom
    classroom = Classroom(
        teacher_id=teacher.id,
        organization_id=organization.id if organization else None,
        name=name,
        description=description,
        visibility=visibility,
        access_code=access_code if visibility == "private" else None,
    )
    db.add(classroom)
    db.flush()
    return classroom


def _ensure_enrollment(db: Session, classroom: Classroom, student: User) -> ClassroomEnrollment:
    enrollment = db.scalar(
        select(ClassroomEnrollment).where(
            ClassroomEnrollment.classroom_id == classroom.id,
            ClassroomEnrollment.student_id == student.id,
        )
    )
    if enrollment is not None:
        return enrollment
    enrollment = ClassroomEnrollment(classroom_id=classroom.id, student_id=student.id)
    db.add(enrollment)
    db.flush()
    return enrollment


def _ensure_list_unlock(
    db: Session,
    qlist: QuestionList,
    student: User,
) -> QuestionListUnlock:
    unlock = db.scalar(
        select(QuestionListUnlock).where(
            QuestionListUnlock.question_list_id == qlist.id,
            QuestionListUnlock.student_id == student.id,
        )
    )
    if unlock is not None:
        return unlock
    unlock = QuestionListUnlock(question_list_id=qlist.id, student_id=student.id)
    db.add(unlock)
    db.flush()
    return unlock


def _get_or_create_list(
    db: Session,
    classroom: Classroom | None,
    teacher: User,
    title: str,
    description: str,
    is_published: bool,
    questions_spec: list[QuestionSeed],
    topics_by_slug: dict[str, Topic],
    *,
    is_standalone: bool = False,
    visibility: str = "public",
    access_code: str | None = None,
) -> tuple[QuestionList, list[Question]]:
    if is_standalone:
        qlist = db.scalar(
            select(QuestionList).where(
                QuestionList.teacher_id == teacher.id,
                QuestionList.is_standalone.is_(True),
                QuestionList.title == title,
            )
        )
    else:
        assert classroom is not None
        qlist = db.scalar(
            select(QuestionList).where(
                QuestionList.classroom_id == classroom.id,
                QuestionList.title == title,
            )
        )

    if qlist is None:
        qlist = QuestionList(
            classroom_id=None if is_standalone else classroom.id,  # type: ignore[union-attr]
            teacher_id=teacher.id,
            is_standalone=is_standalone,
            visibility="public" if is_standalone else visibility,
            access_code=None if (is_standalone or visibility == "public") else access_code,
            title=title,
            description=description,
            is_published=is_published,
        )
        db.add(qlist)
        db.flush()

    existing_questions = db.scalars(
        select(Question)
        .where(Question.question_list_id == qlist.id)
        .order_by(Question.order_index.asc())
    ).all()

    if len(existing_questions) == len(questions_spec):
        return qlist, list(existing_questions)

    questions_by_order = {q.order_index: q for q in existing_questions}
    result_questions: list[Question] = []
    for index, spec in enumerate(questions_spec, start=1):
        question = questions_by_order.get(index)
        if question is None:
            question = Question(
                question_list_id=qlist.id,
                topic_id=topics_by_slug[spec.topic_slug].id,
                order_index=index,
                statement=spec.statement,
                option_a=spec.option_a,
                option_b=spec.option_b,
                option_c=spec.option_c,
                option_d=spec.option_d,
                correct_option=spec.correct_option,
                explanation=spec.explanation,
            )
            db.add(question)
            db.flush()
        result_questions.append(question)
    return qlist, result_questions


def _ensure_submission(
    db: Session,
    qlist: QuestionList,
    questions: list[Question],
    student: User,
    attempt_number: int,
    selected_options: list[str],
    submitted_at: datetime,
    teacher: User | None = None,
    teacher_comment: str | None = None,
) -> Submission:
    existing = db.scalar(
        select(Submission).where(
            Submission.question_list_id == qlist.id,
            Submission.student_id == student.id,
            Submission.attempt_number == attempt_number,
        )
    )
    if existing is not None:
        return existing

    assert len(questions) == len(selected_options)
    correct_count = 0
    answers: list[SubmissionAnswer] = []
    for question, selected in zip(questions, selected_options, strict=True):
        is_correct = selected == question.correct_option
        if is_correct:
            correct_count += 1
        answers.append(
            SubmissionAnswer(
                question_id=question.id,
                selected_option=selected,
                is_correct=is_correct,
            )
        )

    score = (Decimal(correct_count * 100) / Decimal(len(questions))).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    submission = Submission(
        question_list_id=qlist.id,
        student_id=student.id,
        attempt_number=attempt_number,
        correct_count=correct_count,
        total_questions=len(questions),
        score_percentage=score,
        teacher_comment=teacher_comment,
        teacher_commented_at=(submitted_at + timedelta(hours=2)) if teacher_comment else None,
        teacher_commented_by=teacher.id if (teacher_comment and teacher) else None,
        submitted_at=submitted_at,
        answers=answers,
    )
    db.add(submission)
    db.flush()
    return submission


def _ensure_retake(
    db: Session,
    qlist: QuestionList,
    student: User,
    status: str,
    requested_by_student: bool,
    request_reason: str | None,
    teacher: User | None,
    created_at: datetime,
    reviewed_at: datetime | None = None,
    consumed_at: datetime | None = None,
) -> RetakeAuthorization:
    existing = db.scalar(
        select(RetakeAuthorization).where(
            RetakeAuthorization.question_list_id == qlist.id,
            RetakeAuthorization.student_id == student.id,
        )
    )
    if existing is not None:
        return existing

    retake = RetakeAuthorization(
        question_list_id=qlist.id,
        student_id=student.id,
        status=status,
        requested_by_student=requested_by_student,
        request_reason=request_reason,
        reviewed_by_teacher_id=teacher.id if teacher else None,
        created_at=created_at,
        reviewed_at=reviewed_at,
        consumed_at=consumed_at,
    )
    db.add(retake)
    db.flush()
    return retake


def seed_database(db: Session) -> None:
    """Populate Synapta with rich, idempotent multidisciplinary demo data."""
    ana = _get_or_create_user(db, "Ana Paula", "ana.paula@synapta.edu", "Professor123!", "teacher")
    carlos = _get_or_create_user(
        db, "Carlos Mendes", "carlos.mendes@synapta.edu", "Professor123!", "teacher"
    )

    lucas = _get_or_create_user(db, "Lucas Silva", "lucas@synapta.edu", "Aluno123!", "student")
    mariana = _get_or_create_user(db, "Mariana Costa", "mariana@synapta.edu", "Aluno123!", "student")
    gabriel = _get_or_create_user(db, "Gabriel Rocha", "gabriel@synapta.edu", "Aluno123!", "student")
    sofia = _get_or_create_user(db, "Sofia Almeida", "sofia@synapta.edu", "Aluno123!", "student")
    pedro = _get_or_create_user(db, "Pedro Henrique", "pedro@synapta.edu", "Aluno123!", "student")

    topics_data = [
        (
            "Frações e Números Decimais",
            "fracoes-e-numeros-decimais",
            "Operações com frações, simplificação, equivalência e conversão entre frações e decimais.",
        ),
        (
            "Porcentagem e Proporção",
            "porcentagem-e-proporcao",
            "Cálculos percentuais, descontos, acréscimos e regra de três simples.",
        ),
        (
            "Equações do 1º Grau",
            "equacoes-do-1-grau",
            "Resolução de equações lineares e problemas contextualizados do 1º grau.",
        ),
        (
            "Equações do 2º Grau",
            "equacoes-do-2-grau",
            "Fórmula de Bhaskara, discriminante e relações entre coeficientes e raízes.",
        ),
        (
            "Geometria Plana",
            "geometria-plana",
            "Áreas, perímetros, triângulos, Teorema de Pitágoras e polígonos.",
        ),
        (
            "Probabilidade e Estatística",
            "probabilidade-e-estatistica",
            "Probabilidade simples, média aritmética, mediana e moda.",
        ),
        (
            "Biologia Celular e Genética",
            "biologia-celular-e-genetica",
            "Organelas celulares, divisão celular, síntese proteica e leis da hereditariedade.",
        ),
        (
            "História do Brasil",
            "historia-do-brasil",
            "Brasil Colônia, Império, República e transformações políticas e sociais contemporâneas.",
        ),
        (
            "Interpretação de Texto",
            "interpretacao-de-texto",
            "Compreensão leitora, inferência, coesão, coerência e identificação de argumentos.",
        ),
        (
            "Física - Mecânica",
            "fisica-mecanica",
            "Cinemática, leis de Newton, trabalho, energia mecânica e conservação de movimento.",
        ),
    ]
    topics_by_slug = {
        slug: _get_or_create_topic(db, name, slug, desc) for name, slug, desc in topics_data
    }

    org_horizonte = _get_or_create_organization(
        db,
        ana,
        "Instituto Horizonte Educacional",
        "Rede multidisciplinar de ensino com turmas abertas e trilhas avançadas de avaliação.",
        visibility="public",
    )
    org_vertice = _get_or_create_organization(
        db,
        carlos,
        "Colégio Vértice",
        "Instituição privada com simulados preparatórios para exames nacionais e vestibulares.",
        visibility="private",
        access_code="VERTICE26",
    )

    _ensure_org_membership(db, org_horizonte, ana, "owner")
    _ensure_org_membership(db, org_horizonte, carlos, "teacher")
    for student in (lucas, mariana, gabriel, sofia):
        _ensure_org_membership(db, org_horizonte, student, "student")

    _ensure_org_membership(db, org_vertice, carlos, "owner")
    for student in (mariana, sofia):
        _ensure_org_membership(db, org_vertice, student, "student")

    turma_a = _get_or_create_classroom(
        db,
        ana,
        "Ciências Exatas 8º Ano - Turma A",
        "Turma regular com simulados semanais de aritmética, álgebra, geometria e física.",
        organization=org_horizonte,
        visibility="public",
    )
    turma_bio_fis = _get_or_create_classroom(
        db,
        carlos,
        "Biologia & Física - Aprofundamento",
        "Turma privada do Instituto Horizonte voltada às Ciências da Natureza.",
        organization=org_horizonte,
        visibility="private",
        access_code="BIOFIS26",
    )
    turma_humanidades = _get_or_create_classroom(
        db,
        carlos,
        "Humanidades & Linguagens EM",
        "Avaliações diagnósticas em História e Interpretação Textual no Colégio Vértice.",
        organization=org_vertice,
        visibility="public",
    )
    turma_vertice_priv = _get_or_create_classroom(
        db,
        carlos,
        "Preparatório Avançado Vértice",
        "Turma fechada para preparação intensiva de vestibulares.",
        organization=org_vertice,
        visibility="private",
        access_code="PREP2026",
    )
    turma_reforco = _get_or_create_classroom(
        db,
        ana,
        "Reforço Multidisciplinar Aberto",
        "Turma independente (sem organização) aberta para consolidação de fundamentos.",
        organization=None,
        visibility="public",
    )

    for student in (lucas, mariana, gabriel, sofia):
        _ensure_enrollment(db, turma_a, student)
    for student in (mariana, sofia):
        _ensure_enrollment(db, turma_bio_fis, student)
        _ensure_enrollment(db, turma_humanidades, student)
    _ensure_enrollment(db, turma_vertice_priv, mariana)
    for student in (lucas, gabriel):
        _ensure_enrollment(db, turma_reforco, student)

    list1, q1 = _get_or_create_list(
        db,
        turma_a,
        ana,
        "Simulado 1: Frações, Porcentagem e Equações do 1º Grau",
        "Avaliação diagnóstica cobrindo operações com frações, variações percentuais e equações lineares.",
        True,
        [
            QuestionSeed(
                topic_slug="fracoes-e-numeros-decimais",
                statement="Calcule o valor da soma 3/4 + 2/5.",
                option_a="5/9",
                option_b="23/20",
                option_c="6/20",
                option_d="19/20",
                correct_option="B",
                explanation="O MMC entre 4 e 5 é 20. Convertendo: 3/4 = 15/20 e 2/5 = 8/20. Somando: 23/20.",
            ),
            QuestionSeed(
                topic_slug="fracoes-e-numeros-decimais",
                statement="Um tanque com capacidade de 60 litros está com 3/5 preenchidos. Quantos litros faltam para enchê-lo?",
                option_a="18 litros",
                option_b="36 litros",
                option_c="24 litros",
                option_d="40 litros",
                correct_option="C",
                explanation="Faltam 1 - 3/5 = 2/5 da capacidade total: (2 × 60) / 5 = 24 litros.",
            ),
            QuestionSeed(
                topic_slug="porcentagem-e-proporcao",
                statement="Uma mochila de R$ 180,00 recebeu 15% de desconto à vista. Qual foi o valor final pago?",
                option_a="R$ 153,00",
                option_b="R$ 145,00",
                option_c="R$ 165,00",
                option_d="R$ 158,00",
                correct_option="A",
                explanation="15% de R$ 180,00 = R$ 27,00. Subtraindo do preço original: 180 - 27 = R$ 153,00.",
            ),
            QuestionSeed(
                topic_slug="porcentagem-e-proporcao",
                statement="Uma torneira despeja 12 L/min e enche um reservatório em 25 minutos. Com 15 L/min, em quanto tempo encherá?",
                option_a="18 minutos",
                option_b="22 minutos",
                option_c="31 minutos",
                option_d="20 minutos",
                correct_option="D",
                explanation="Volume total = 12 × 25 = 300 litros. Com vazão de 15 L/min: 300 / 15 = 20 minutos.",
            ),
            QuestionSeed(
                topic_slug="equacoes-do-1-grau",
                statement="Resolva a equação do 1º grau: 3(x - 2) + 4 = 2x + 5.",
                option_a="x = 3",
                option_b="x = 5",
                option_c="x = 7",
                option_d="x = 9",
                correct_option="C",
                explanation="3x - 6 + 4 = 2x + 5 => 3x - 2 = 2x + 5 => x = 7.",
            ),
            QuestionSeed(
                topic_slug="equacoes-do-1-grau",
                statement="A soma de dois números inteiros consecutivos é 47. Qual é o maior deles?",
                option_a="24",
                option_b="23",
                option_c="25",
                option_d="22",
                correct_option="A",
                explanation="x + (x + 1) = 47 => 2x = 46 => x = 23. Logo, o maior é 24.",
            ),
        ],
        topics_by_slug,
    )

    list2, q2 = _get_or_create_list(
        db,
        turma_a,
        ana,
        "Simulado 2: Geometria Plana e Probabilidade",
        "Questões de cálculo de área, Teorema de Pitágoras, probabilidade básica e média aritmética.",
        True,
        [
            QuestionSeed(
                topic_slug="geometria-plana",
                statement="Um terreno retangular mede 18 m por 12 m. Qual é a área e o perímetro, respectivamente?",
                option_a="216 m² e 30 m",
                option_b="216 m² e 60 m",
                option_c="108 m² e 60 m",
                option_d="240 m² e 54 m",
                correct_option="B",
                explanation="Área = 18 × 12 = 216 m². Perímetro = 2 × (18 + 12) = 60 m.",
            ),
            QuestionSeed(
                topic_slug="geometria-plana",
                statement="Um triângulo tem base de 14 cm e altura de 9 cm. Qual é a sua área?",
                option_a="126 cm²",
                option_b="46 cm²",
                option_c="63 cm²",
                option_d="72 cm²",
                correct_option="C",
                explanation="Área do triângulo = (14 × 9) / 2 = 63 cm².",
            ),
            QuestionSeed(
                topic_slug="geometria-plana",
                statement="Em um triângulo retângulo, os catetos medem 6 cm e 8 cm. Qual é a hipotenusa?",
                option_a="10 cm",
                option_b="12 cm",
                option_c="14 cm",
                option_d="48 cm",
                correct_option="A",
                explanation="Pelo Teorema de Pitágoras: h² = 6² + 8² = 100 => h = 10 cm.",
            ),
            QuestionSeed(
                topic_slug="probabilidade-e-estatistica",
                statement="Uma urna contém 4 bolas azuis, 3 verdes e 5 vermelhas. Qual a probabilidade de sortear uma bola verde?",
                option_a="20%",
                option_b="30%",
                option_c="33,3%",
                option_d="25%",
                correct_option="D",
                explanation="São 3 bolas verdes em 12 no total: 3/12 = 1/4 = 25%.",
            ),
            QuestionSeed(
                topic_slug="probabilidade-e-estatistica",
                statement="As notas de um estudante em quatro avaliações foram 6,0; 7,5; 8,5 e 10,0. Qual foi a média aritmética?",
                option_a="7,5",
                option_b="8,0",
                option_c="8,5",
                option_d="7,8",
                correct_option="B",
                explanation="Média = (6,0 + 7,5 + 8,5 + 10,0) / 4 = 32,0 / 4 = 8,0.",
            ),
        ],
        topics_by_slug,
    )

    list3, q3 = _get_or_create_list(
        db,
        turma_reforco,
        ana,
        "Lista de Reforço: Equações e Geometria",
        "Exercícios dirigidos para reforçar equações do 1º e 2º grau além de geometria métrica.",
        True,
        [
            QuestionSeed(
                topic_slug="equacoes-do-1-grau",
                statement="Determine o valor de x na equação (x / 3) + (x / 2) = 10.",
                option_a="6",
                option_b="10",
                option_c="12",
                option_d="15",
                correct_option="C",
                explanation="MMC(3, 2) = 6 => (2x + 3x) / 6 = 10 => 5x = 60 => x = 12.",
            ),
            QuestionSeed(
                topic_slug="equacoes-do-2-grau",
                statement="Quais são as raízes reais da equação x² - 7x + 12 = 0?",
                option_a="3 e 4",
                option_b="-3 e -4",
                option_c="2 e 6",
                option_d="1 e 12",
                correct_option="A",
                explanation="Soma = 7 e produto = 12 => raízes 3 e 4.",
            ),
            QuestionSeed(
                topic_slug="equacoes-do-2-grau",
                statement="Para 2x² - 4x + 2 = 0, qual é o valor de Δ e quantas raízes reais distintas existem?",
                option_a="Δ = 32, duas raízes distintas",
                option_b="Δ = 0, uma raiz real dupla",
                option_c="Δ = -16, nenhuma raiz real",
                option_d="Δ = 16, duas raízes distintas",
                correct_option="B",
                explanation="Δ = (-4)² - 4(2)(2) = 0, resultando em uma única raiz real dupla (x = 1).",
            ),
            QuestionSeed(
                topic_slug="geometria-plana",
                statement="Um círculo possui raio de 5 cm. Considerando π ≈ 3,14, qual é a sua área aproximada?",
                option_a="31,4 cm²",
                option_b="62,8 cm²",
                option_c="15,7 cm²",
                option_d="78,5 cm²",
                correct_option="D",
                explanation="A = π · r² ≈ 3,14 × 25 = 78,5 cm².",
            ),
            QuestionSeed(
                topic_slug="geometria-plana",
                statement="Qual é a soma dos ângulos internos de um pentágono convexo?",
                option_a="360°",
                option_b="540°",
                option_c="720°",
                option_d="450°",
                correct_option="B",
                explanation="S = (n - 2) × 180° = (5 - 2) × 180° = 540°.",
            ),
        ],
        topics_by_slug,
    )

    list4, q4 = _get_or_create_list(
        db,
        turma_humanidades,
        carlos,
        "Avaliação Diagnóstica: Humanidades e Linguagens",
        "Simulado multidisciplinar do Colégio Vértice cobrindo História do Brasil e Interpretação de Texto.",
        True,
        [
            QuestionSeed(
                topic_slug="historia-do-brasil",
                statement="Qual foi a principal atividade econômica que estruturou o período inicial da colonização portuguesa no Nordeste brasileiro?",
                option_a="Extração aurífera em Minas Gerais",
                option_b="Produção açucareira baseada em latifúndio e trabalho escravizado",
                option_c="Cafeicultura no Vale do Paraíba",
                option_d="Industrialização têxtil urbana",
                correct_option="B",
                explanation="Nos séculos XVI e XVII, o engenho açucareiro no litoral nordestino foi o eixo central da economia colonial.",
            ),
            QuestionSeed(
                topic_slug="historia-do-brasil",
                statement="A Constituição brasileira promulgada em 1988 ficou historicamente conhecida como:",
                option_a="Constituição Cidadã",
                option_b="Constituição da Mandioca",
                option_c="Constituição Polaca",
                option_d="Carta Outorgada de 1824",
                correct_option="A",
                explanation="Promulgada após o regime militar, a Constituição de 1988 ampliou direitos sociais e garantias individuais, recebendo o título de Constituição Cidadã.",
            ),
            QuestionSeed(
                topic_slug="interpretacao-de-texto",
                statement="Em um artigo de opinião, qual elemento garante a força persuasiva da tese defendida pelo autor?",
                option_a="Uso exclusivo de linguagem poética sem dados",
                option_b="Repetição literal da introdução na conclusão",
                option_c="Articulação coerente entre argumentos, evidências e contra-argumentos",
                option_d="Ausência de conectivos lógicos entre parágrafos",
                correct_option="C",
                explanation="Textos dissertativo-argumentativos sustentam a tese por meio de evidências verificáveis e progressão coesa de ideias.",
            ),
            QuestionSeed(
                topic_slug="interpretacao-de-texto",
                statement="Quando um texto utiliza ironia para criticar um comportamento social, o sentido pretendido depende principalmente de:",
                option_a="Leitura isolada de palavras fora de contexto",
                option_b="Compreensão do contexto comunicativo e da discrepância entre o dito e o intencionado",
                option_c="Substituição obrigatória de verbos por substantivos",
                option_d="Aplicação de regras métricas de versificação",
                correct_option="B",
                explanation="A ironia opera pelo contraste intencional entre o sentido literal e o contexto pragmático da enunciação.",
            ),
        ],
        topics_by_slug,
    )

    list5, q5 = _get_or_create_list(
        db,
        turma_bio_fis,
        carlos,
        "Simulado de Ciências da Natureza: Biologia e Física",
        "Avaliação da turma privada de aprofundamento em Biologia Celular e Mecânica Clássica.",
        True,
        [
            QuestionSeed(
                topic_slug="biologia-celular-e-genetica",
                statement="Qual organela celular é a principal responsável pela respiração celular aeróbica e produção de ATP em eucariotos?",
                option_a="Complexo golgiense",
                option_b="Lisossomo",
                option_c="Mitocôndria",
                option_d="Ribossomo",
                correct_option="C",
                explanation="As mitocôndrias realizam o ciclo de Krebs e a fosforilação oxidativa, gerando a maior parte do ATP celular.",
            ),
            QuestionSeed(
                topic_slug="biologia-celular-e-genetica",
                statement="No cruzamento entre dois indivíduos heterozigotos (Aa × Aa) com dominância completa, qual a proporção fenotípica esperada?",
                option_a="1:1",
                option_b="3:1",
                option_c="2:1",
                option_d="100% recessivo",
                correct_option="B",
                explanation="Os genótipos resultantes são 1 AA : 2 Aa : 1 aa, gerando 3 dominantes para 1 recessivo (3:1).",
            ),
            QuestionSeed(
                topic_slug="fisica-mecanica",
                statement="Um automóvel percorre 150 km em 2 horas com velocidade escalar média constante. Qual é sua velocidade em km/h?",
                option_a="65 km/h",
                option_b="75 km/h",
                option_c="80 km/h",
                option_d="300 km/h",
                correct_option="B",
                explanation="Velocidade média = Δs / Δt = 150 km / 2 h = 75 km/h.",
            ),
            QuestionSeed(
                topic_slug="fisica-mecanica",
                statement="De acordo com a 2ª Lei de Newton, uma força resultante de 20 N aplicada a um corpo de massa 4 kg produz qual aceleração?",
                option_a="5 m/s²",
                option_b="16 m/s²",
                option_c="24 m/s²",
                option_d="80 m/s²",
                correct_option="A",
                explanation="Pela relação F = m · a, temos a = F / m = 20 / 4 = 5 m/s².",
            ),
        ],
        topics_by_slug,
    )

    list6_private, q6_private = _get_or_create_list(
        db,
        turma_a,
        ana,
        "Avaliação Fechada: Desafios de Física e Álgebra",
        "Simulado privado da Turma A que exige código de acesso fornecido em aula.",
        True,
        [
            QuestionSeed(
                topic_slug="fisica-mecanica",
                statement="Um objeto em queda livre a partir do repouso (g = 10 m/s²) atinge qual velocidade após 3 segundos?",
                option_a="15 m/s",
                option_b="30 m/s",
                option_c="45 m/s",
                option_d="90 m/s",
                correct_option="B",
                explanation="Pela equação v = v0 + g·t = 0 + 10 × 3 = 30 m/s.",
            ),
            QuestionSeed(
                topic_slug="equacoes-do-2-grau",
                statement="Qual é o produto das raízes da equação x² - 8x + 15 = 0?",
                option_a="8",
                option_b="-8",
                option_c="15",
                option_d="-15",
                correct_option="C",
                explanation="Pelas relações de Girard, o produto das raízes é c/a = 15/1 = 15.",
            ),
            QuestionSeed(
                topic_slug="porcentagem-e-proporcao",
                statement="Se 24 estudantes de uma turma de 30 entregaram o projeto no prazo, qual foi a taxa de entrega?",
                option_a="70%",
                option_b="75%",
                option_c="80%",
                option_d="85%",
                correct_option="C",
                explanation="24 / 30 = 4/5 = 0,80 = 80%.",
            ),
        ],
        topics_by_slug,
        visibility="private",
        access_code="DESAFIO26",
    )

    _get_or_create_list(
        db,
        turma_a,
        ana,
        "Rascunho: Revisão Interdisciplinar",
        "Lista em preparação (ainda não publicada para os alunos) com revisão multidisciplinar.",
        False,
        [
            QuestionSeed(
                topic_slug="fracoes-e-numeros-decimais",
                statement="Converta o número decimal 0,375 para a forma de fração irredutível.",
                option_a="3/8",
                option_b="3/4",
                option_c="5/8",
                option_d="37/100",
                correct_option="A",
                explanation="0,375 = 375/1000. Dividindo numerador e denominador por 125, obtemos 3/8.",
            ),
            QuestionSeed(
                topic_slug="biologia-celular-e-genetica",
                statement="Qual ácido nucleico atua diretamente como molde no citoplasma para a tradução nos ribossomos?",
                option_a="DNA mitocondrial",
                option_b="RNA mensageiro (RNAm)",
                option_c="ATP sintase",
                option_d="Colágeno",
                correct_option="B",
                explanation="O RNA mensageiro transporta a sequência codificadora do núcleo até os ribossomos.",
            ),
            QuestionSeed(
                topic_slug="historia-do-brasil",
                statement="Em que ano ocorreu a Proclamação da República no Brasil?",
                option_a="1822",
                option_b="1888",
                option_c="1889",
                option_d="1930",
                correct_option="C",
                explanation="A República foi proclamada em 15 de novembro de 1889.",
            ),
        ],
        topics_by_slug,
    )

    standalone1, q_standalone1 = _get_or_create_list(
        db,
        None,
        ana,
        "Simulado Aberto Nacional: Multidisciplinar",
        "Simulado avulso aberto a qualquer estudante, reunindo Biologia, História, Linguagens e Porcentagem.",
        True,
        [
            QuestionSeed(
                topic_slug="biologia-celular-e-genetica",
                statement="Em qual etapa da mitose os cromossomos atingem seu grau máximo de condensação e se alinham na placa equatorial?",
                option_a="Prófase",
                option_b="Metáfase",
                option_c="Anáfase",
                option_d="Telófase",
                correct_option="B",
                explanation="Na metáfase, os cromossomos alinham-se no plano equatorial da célula presos às fibras do fuso.",
            ),
            QuestionSeed(
                topic_slug="historia-do-brasil",
                statement="Qual movimento político de 1930 pôs fim à chamada República Velha (Política do Café com Leite)?",
                option_a="Revolta da Vacina",
                option_b="Revolução Constitucionalista",
                option_c="Revolução de 1930",
                option_d="Guerra de Canudos",
                correct_option="C",
                explanation="A Revolução de 1930 levou Getúlio Vargas ao poder e encerrou a hegemonia oligárquica da Primeira República.",
            ),
            QuestionSeed(
                topic_slug="interpretacao-de-texto",
                statement="A coesão referencial em um parágrafo é obtida principalmente pelo uso de:",
                option_a="Pronomes e sinônimos que retomam termos já mencionados",
                option_b="Frases desconexas sem sujeito",
                option_c="Pontuação aleatória ao final de cada palavra",
                option_d="Neologismos técnicos sem definição",
                correct_option="A",
                explanation="Pronomes, advérbios e substituições lexicais mantêm a continuidade referencial do texto.",
            ),
            QuestionSeed(
                topic_slug="porcentagem-e-proporcao",
                statement="Uma biblioteca aumentou seu acervo de 1.200 para 1.500 livros. Qual foi o percentual de crescimento?",
                option_a="20%",
                option_b="25%",
                option_c="30%",
                option_d="15%",
                correct_option="B",
                explanation="O acréscimo foi de 300 livros sobre 1.200 iniciais: 300 / 1200 = 0,25 = 25%.",
            ),
        ],
        topics_by_slug,
        is_standalone=True,
    )

    standalone2, q_standalone2 = _get_or_create_list(
        db,
        None,
        carlos,
        "Desafio Relâmpago: Física e Interpretação",
        "Simulado avulso multidisciplinar aberto para treinar raciocínio físico e compreensão textual.",
        True,
        [
            QuestionSeed(
                topic_slug="fisica-mecanica",
                statement="Qual grandeza física permanece constante em um Movimento Retilíneo Uniforme (MRU)?",
                option_a="Aceleração diferente de zero",
                option_b="Velocidade vetorial",
                option_c="Posição inicial sempre nula",
                option_d="Força resultante crescente",
                correct_option="B",
                explanation="No MRU, a trajetória é retilínea e a velocidade é constante em módulo, direção e sentido.",
            ),
            QuestionSeed(
                topic_slug="interpretacao-de-texto",
                statement="Qual gênero textual tem como objetivo primordial instruir o leitor por meio de passos sequenciais e verbos no imperativo?",
                option_a="Crônica lírica",
                option_b="Manual de instruções ou receita",
                option_c="Editorial jornalístico",
                option_d="Resenha crítica",
                correct_option="B",
                explanation="Textos injuntivos/instrucionais orientam ações práticas por meio de sequências ordenadas.",
            ),
            QuestionSeed(
                topic_slug="probabilidade-e-estatistica",
                statement="Ao lançar uma moeda honesta duas vezes seguidas, qual é a probabilidade de obter duas caras?",
                option_a="1/2",
                option_b="1/3",
                option_c="1/4",
                option_d="3/4",
                correct_option="C",
                explanation="Há 4 resultados equiprováveis: (C,C), (C,K), (K,C), (K,K). Apenas 1 é duas caras: 1/4.",
            ),
        ],
        topics_by_slug,
        is_standalone=True,
    )

    _ensure_list_unlock(db, list6_private, lucas)

    now = datetime.now(UTC)

    # Lucas: List 1 (attempt 1: 50%, consumed retake -> attempt 2: 83.33%), List 2 (60% + pending retake), List 3 (80%), List 6 private (100%), Standalone 1 (75%)
    _ensure_submission(
        db,
        list1,
        q1,
        lucas,
        attempt_number=1,
        selected_options=["A", "B", "A", "A", "C", "A"],  # 3/6 = 50%
        submitted_at=now - timedelta(days=5),
        teacher=ana,
        teacher_comment="Bom raciocínio em equações do 1º grau, Lucas! Revise MMC de frações e regra de três inversa.",
    )
    _ensure_retake(
        db,
        list1,
        lucas,
        status="consumed",
        requested_by_student=True,
        request_reason="Revisei o conteúdo de frações e gostaria de tentar melhorar minha nota.",
        teacher=ana,
        created_at=now - timedelta(days=4, hours=12),
        reviewed_at=now - timedelta(days=4, hours=6),
        consumed_at=now - timedelta(days=3),
    )
    _ensure_submission(
        db,
        list1,
        q1,
        lucas,
        attempt_number=2,
        selected_options=["B", "C", "A", "B", "C", "A"],  # 5/6 = 83.33%
        submitted_at=now - timedelta(days=3),
        teacher=ana,
        teacher_comment="Excelente evolução na segunda tentativa! Atenção apenas à regra de três inversa.",
    )
    _ensure_submission(
        db,
        list2,
        q2,
        lucas,
        attempt_number=1,
        selected_options=["B", "A", "D", "D", "B"],  # 3/5 = 60%
        submitted_at=now - timedelta(days=2),
    )
    _ensure_retake(
        db,
        list2,
        lucas,
        status="pending",
        requested_by_student=True,
        request_reason="Errei as fórmulas de triângulo e Pitágoras por distração, posso refazer?",
        teacher=None,
        created_at=now - timedelta(days=1, hours=10),
    )
    _ensure_submission(
        db,
        list3,
        q3,
        lucas,
        attempt_number=1,
        selected_options=["C", "A", "B", "A", "B"],  # 4/5 = 80%
        submitted_at=now - timedelta(days=1),
    )
    _ensure_submission(
        db,
        list6_private,
        q6_private,
        lucas,
        attempt_number=1,
        selected_options=["B", "C", "C"],  # 3/3 = 100%
        submitted_at=now - timedelta(hours=16),
    )
    _ensure_submission(
        db,
        standalone1,
        q_standalone1,
        lucas,
        attempt_number=1,
        selected_options=["B", "C", "A", "A"],  # 3/4 = 75%
        submitted_at=now - timedelta(hours=10),
    )

    # Mariana: List 1 (100%), List 2 (80%), List 4 Humanidades (75% + approved retake), List 5 Bio&Fis (100%), Standalone 1 (100%)
    _ensure_submission(
        db,
        list1,
        q1,
        mariana,
        attempt_number=1,
        selected_options=["B", "C", "A", "D", "C", "A"],  # 6/6 = 100%
        submitted_at=now - timedelta(days=4),
        teacher=ana,
        teacher_comment="Desempenho impecável, Mariana! Todos os passos bem consolidados.",
    )
    _ensure_submission(
        db,
        list2,
        q2,
        mariana,
        attempt_number=1,
        selected_options=["B", "C", "A", "A", "B"],  # 4/5 = 80%
        submitted_at=now - timedelta(days=2),
    )
    _ensure_submission(
        db,
        list4,
        q4,
        mariana,
        attempt_number=1,
        selected_options=["B", "A", "C", "A"],  # 3/4 = 75%
        submitted_at=now - timedelta(days=1, hours=12),
        teacher=carlos,
        teacher_comment="Ótima leitura histórica! Liberei nova tentativa para revisar o sentido pragmático da ironia.",
    )
    _ensure_retake(
        db,
        list4,
        mariana,
        status="approved",
        requested_by_student=False,
        request_reason=None,
        teacher=carlos,
        created_at=now - timedelta(days=1, hours=6),
        reviewed_at=now - timedelta(days=1, hours=6),
    )
    _ensure_submission(
        db,
        list5,
        q5,
        mariana,
        attempt_number=1,
        selected_options=["C", "B", "B", "A"],  # 4/4 = 100%
        submitted_at=now - timedelta(hours=22),
    )
    _ensure_submission(
        db,
        standalone1,
        q_standalone1,
        mariana,
        attempt_number=1,
        selected_options=["B", "C", "A", "B"],  # 4/4 = 100%
        submitted_at=now - timedelta(hours=8),
    )

    # Gabriel: List 1 (33.33%), List 3 (40% + pending retake)
    _ensure_submission(
        db,
        list1,
        q1,
        gabriel,
        attempt_number=1,
        selected_options=["A", "A", "B", "B", "C", "A"],  # 2/6 = 33.33%
        submitted_at=now - timedelta(days=4),
        teacher=ana,
        teacher_comment="Gabriel, vamos reforçar frações e porcentagem nos plantões antes da próxima lista.",
    )
    _ensure_submission(
        db,
        list3,
        q3,
        gabriel,
        attempt_number=1,
        selected_options=["C", "B", "A", "A", "B"],  # 2/5 = 40%
        submitted_at=now - timedelta(days=1, hours=20),
    )
    _ensure_retake(
        db,
        list3,
        gabriel,
        status="pending",
        requested_by_student=True,
        request_reason="Estudei Bhaskara e área do círculo no reforço e quero refazer a lista.",
        teacher=None,
        created_at=now - timedelta(hours=14),
    )

    # Sofia: List 1 (66.67%), List 2 (40%), List 4 (50%), List 5 (75%), Standalone 2 (66.67%)
    _ensure_submission(
        db,
        list1,
        q1,
        sofia,
        attempt_number=1,
        selected_options=["A", "C", "A", "D", "B", "A"],  # 4/6 = 66.67%
        submitted_at=now - timedelta(days=3),
    )
    _ensure_submission(
        db,
        list2,
        q2,
        sofia,
        attempt_number=1,
        selected_options=["A", "B", "C", "D", "B"],  # 2/5 = 40%
        submitted_at=now - timedelta(days=2),
        teacher=ana,
        teacher_comment="Seu desempenho em probabilidade e média foi ótimo! Precisamos revisar áreas e Pitágoras.",
    )
    _ensure_submission(
        db,
        list4,
        q4,
        sofia,
        attempt_number=1,
        selected_options=["B", "B", "C", "A"],  # 2/4 = 50%
        submitted_at=now - timedelta(days=1),
    )
    _ensure_submission(
        db,
        list5,
        q5,
        sofia,
        attempt_number=1,
        selected_options=["C", "B", "A", "A"],  # 3/4 = 75%
        submitted_at=now - timedelta(hours=18),
    )
    _ensure_submission(
        db,
        standalone2,
        q_standalone2,
        sofia,
        attempt_number=1,
        selected_options=["B", "B", "A"],  # 2/3 = 66.67%
        submitted_at=now - timedelta(hours=6),
    )

    # Pedro Henrique (not enrolled in any classroom): solves Standalone 1 (50%) + pending retake
    _ensure_submission(
        db,
        standalone1,
        q_standalone1,
        pedro,
        attempt_number=1,
        selected_options=["B", "A", "A", "A"],  # 2/4 = 50%
        submitted_at=now - timedelta(hours=5),
    )
    _ensure_retake(
        db,
        standalone1,
        pedro,
        status="pending",
        requested_by_student=True,
        request_reason="Revisei História do Brasil e porcentagem e gostaria de refazer este simulado avulso.",
        teacher=None,
        created_at=now - timedelta(hours=2),
    )

    db.commit()


def main() -> None:
    """CLI entrypoint to run idempotent database seeding."""
    with SessionLocal() as db:
        seed_database(db)
    print("Seed concluído com sucesso.")


if __name__ == "__main__":
    main()
