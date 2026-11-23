from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.classroom import Classroom, ClassroomEnrollment
from app.models.question_list import Question, QuestionList
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


def _get_or_create_classroom(
    db: Session,
    teacher: User,
    name: str,
    description: str,
) -> Classroom:
    classroom = db.scalar(
        select(Classroom).where(Classroom.teacher_id == teacher.id, Classroom.name == name)
    )
    if classroom is not None:
        return classroom
    classroom = Classroom(teacher_id=teacher.id, name=name, description=description)
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


def _get_or_create_list(
    db: Session,
    classroom: Classroom,
    teacher: User,
    title: str,
    description: str,
    is_published: bool,
    questions_spec: list[QuestionSeed],
    topics_by_slug: dict[str, Topic],
) -> tuple[QuestionList, list[Question]]:
    qlist = db.scalar(
        select(QuestionList).where(
            QuestionList.classroom_id == classroom.id,
            QuestionList.title == title,
        )
    )
    if qlist is None:
        qlist = QuestionList(
            classroom_id=classroom.id,
            teacher_id=teacher.id,
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
    """Populate Synapta with rich, idempotent Mathematics demo data."""
    ana = _get_or_create_user(db, "Ana Paula", "ana.paula@synapta.edu", "Professor123!", "teacher")
    carlos = _get_or_create_user(
        db, "Carlos Mendes", "carlos.mendes@synapta.edu", "Professor123!", "teacher"
    )

    lucas = _get_or_create_user(db, "Lucas Silva", "lucas@synapta.edu", "Aluno123!", "student")
    mariana = _get_or_create_user(db, "Mariana Costa", "mariana@synapta.edu", "Aluno123!", "student")
    gabriel = _get_or_create_user(db, "Gabriel Rocha", "gabriel@synapta.edu", "Aluno123!", "student")
    sofia = _get_or_create_user(db, "Sofia Almeida", "sofia@synapta.edu", "Aluno123!", "student")
    _get_or_create_user(db, "Pedro Henrique", "pedro@synapta.edu", "Aluno123!", "student")

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
    ]
    topics_by_slug = {
        slug: _get_or_create_topic(db, name, slug, desc) for name, slug, desc in topics_data
    }

    turma_a = _get_or_create_classroom(
        db,
        ana,
        "Matemática 8º Ano - Turma A",
        "Turma regular com simulados semanais de aritmética, álgebra inicial e geometria.",
    )
    turma_reforco = _get_or_create_classroom(
        db,
        ana,
        "Reforço de Álgebra e Geometria",
        "Trilha de aprofundamento para consolidação de equações e medidas geométricas.",
    )
    turma_em = _get_or_create_classroom(
        db,
        carlos,
        "Matemática 1º Ano EM",
        "Avaliações diagnósticas e preparação para o Ensino Médio em álgebra e estatística.",
    )

    for student in (lucas, mariana, gabriel, sofia):
        _ensure_enrollment(db, turma_a, student)
    for student in (lucas, gabriel):
        _ensure_enrollment(db, turma_reforco, student)
    for student in (mariana, sofia):
        _ensure_enrollment(db, turma_em, student)

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
                explanation="O MMC entre 4 e 5 é 20. Convertendo as frações para o denominador comum: 3/4 = 15/20 e 2/5 = 8/20. Somando os numeradores: 15/20 + 8/20 = 23/20.",
            ),
            QuestionSeed(
                topic_slug="fracoes-e-numeros-decimais",
                statement="Um tanque com capacidade de 60 litros está com 3/5 de sua capacidade preenchida. Quantos litros faltam para enchê-lo completamente?",
                option_a="18 litros",
                option_b="36 litros",
                option_c="24 litros",
                option_d="40 litros",
                correct_option="C",
                explanation="Se 3/5 estão preenchidos, falta preencher 1 - 3/5 = 2/5 da capacidade total. Calculando 2/5 de 60 litros: (2 × 60) / 5 = 120 / 5 = 24 litros.",
            ),
            QuestionSeed(
                topic_slug="porcentagem-e-proporcao",
                statement="Uma mochila que custava R$ 180,00 recebeu um desconto de 15% para pagamento à vista. Qual foi o valor final pago pela mochila?",
                option_a="R$ 153,00",
                option_b="R$ 145,00",
                option_c="R$ 165,00",
                option_d="R$ 158,00",
                correct_option="A",
                explanation="Primeiro calculamos 15% de R$ 180,00: 0,15 × 180 = R$ 27,00. Subtraindo o desconto do preço original: 180 - 27 = R$ 153,00.",
            ),
            QuestionSeed(
                topic_slug="porcentagem-e-proporcao",
                statement="Uma torneira despeja 12 litros por minuto e enche um reservatório em 25 minutos. Se outra torneira despejar 15 litros por minuto, em quanto tempo ela encherá o mesmo reservatório?",
                option_a="18 minutos",
                option_b="22 minutos",
                option_c="31 minutos",
                option_d="20 minutos",
                correct_option="D",
                explanation="O volume total do reservatório é 12 × 25 = 300 litros. Com vazão de 15 litros/minuto (grandezas inversamente proporcionais), o tempo será 300 / 15 = 20 minutos.",
            ),
            QuestionSeed(
                topic_slug="equacoes-do-1-grau",
                statement="Resolva a equação do 1º grau: 3(x - 2) + 4 = 2x + 5.",
                option_a="x = 3",
                option_b="x = 5",
                option_c="x = 7",
                option_d="x = 9",
                correct_option="C",
                explanation="Aplicando a distributiva: 3x - 6 + 4 = 2x + 5, logo 3x - 2 = 2x + 5. Subtraindo 2x e somando 2 em ambos os lados: x = 7.",
            ),
            QuestionSeed(
                topic_slug="equacoes-do-1-grau",
                statement="A soma de dois números inteiros consecutivos é igual a 47. Qual é o maior desses dois números?",
                option_a="24",
                option_b="23",
                option_c="25",
                option_d="22",
                correct_option="A",
                explanation="Se o menor número é x, o consecutivo é x + 1. Assim, x + (x + 1) = 47 => 2x = 46 => x = 23. Portanto, o maior número é 23 + 1 = 24.",
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
                statement="Um terreno retangular mede 18 metros de comprimento por 12 metros de largura. Qual é a área e o perímetro desse terreno, respectivamente?",
                option_a="216 m² e 30 m",
                option_b="216 m² e 60 m",
                option_c="108 m² e 60 m",
                option_d="240 m² e 54 m",
                correct_option="B",
                explanation="A área do retângulo é base × altura = 18 × 12 = 216 m². O perímetro é a soma dos quatro lados: 2 × (18 + 12) = 60 m.",
            ),
            QuestionSeed(
                topic_slug="geometria-plana",
                statement="Um triângulo tem base medindo 14 cm e altura relativa a essa base igual a 9 cm. Qual é a área desse triângulo?",
                option_a="126 cm²",
                option_b="46 cm²",
                option_c="63 cm²",
                option_d="72 cm²",
                correct_option="C",
                explanation="A área do triângulo é dada por (base × altura) / 2. Substituindo: (14 × 9) / 2 = 126 / 2 = 63 cm².",
            ),
            QuestionSeed(
                topic_slug="geometria-plana",
                statement="Em um triângulo retângulo, os catetos medem 6 cm e 8 cm. Qual é a medida da hipotenusa?",
                option_a="10 cm",
                option_b="12 cm",
                option_c="14 cm",
                option_d="48 cm",
                correct_option="A",
                explanation="Pelo Teorema de Pitágoras: h² = 6² + 8² = 36 + 64 = 100. Extraindo a raiz quadrada positiva, temos h = 10 cm.",
            ),
            QuestionSeed(
                topic_slug="probabilidade-e-estatistica",
                statement="Uma urna contém 4 bolas azuis, 3 bolas verdes e 5 bolas vermelhas. Ao sortear uma bola ao acaso, qual é a probabilidade de ela ser verde?",
                option_a="20%",
                option_b="30%",
                option_c="33,3%",
                option_d="25%",
                correct_option="D",
                explanation="O espaço amostral tem 4 + 3 + 5 = 12 bolas. Como há 3 bolas verdes, a probabilidade é 3/12 = 1/4 = 0,25 = 25%.",
            ),
            QuestionSeed(
                topic_slug="probabilidade-e-estatistica",
                statement="As notas de um aluno em quatro provas de Matemática foram 6,0; 7,5; 8,5 e 10,0. Qual foi a média aritmética dessas notas?",
                option_a="7,5",
                option_b="8,0",
                option_c="8,5",
                option_d="7,8",
                correct_option="B",
                explanation="Somamos todas as notas e dividimos pela quantidade de provas: (6,0 + 7,5 + 8,5 + 10,0) / 4 = 32,0 / 4 = 8,0.",
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
                explanation="Tirando o MMC(3, 2) = 6, obtemos (2x + 3x) / 6 = 10 => 5x = 60 => x = 12.",
            ),
            QuestionSeed(
                topic_slug="equacoes-do-2-grau",
                statement="Quais são as raízes reais da equação x² - 7x + 12 = 0?",
                option_a="3 e 4",
                option_b="-3 e -4",
                option_c="2 e 6",
                option_d="1 e 12",
                correct_option="A",
                explanation="Buscamos dois números cuja soma seja 7 e o produto seja 12: 3 + 4 = 7 e 3 × 4 = 12. Logo, as raízes são 3 e 4.",
            ),
            QuestionSeed(
                topic_slug="equacoes-do-2-grau",
                statement="Para a equação 2x² - 4x + 2 = 0, qual é o valor do discriminante (Δ) e quantas raízes reais distintas ela possui?",
                option_a="Δ = 32, duas raízes distintas",
                option_b="Δ = 0, uma raiz real dupla",
                option_c="Δ = -16, nenhuma raiz real",
                option_d="Δ = 16, duas raízes distintas",
                correct_option="B",
                explanation="Calculando Δ = b² - 4ac = (-4)² - 4(2)(2) = 16 - 16 = 0. Quando Δ = 0, a equação apresenta uma única raiz real dupla (x = 1).",
            ),
            QuestionSeed(
                topic_slug="geometria-plana",
                statement="Um círculo possui raio igual a 5 cm. Considerando π ≈ 3,14, qual é a área aproximada desse círculo?",
                option_a="31,4 cm²",
                option_b="62,8 cm²",
                option_c="15,7 cm²",
                option_d="78,5 cm²",
                correct_option="D",
                explanation="A área do círculo é A = π · r². Substituindo r = 5 cm: A ≈ 3,14 × 5² = 3,14 × 25 = 78,5 cm².",
            ),
            QuestionSeed(
                topic_slug="geometria-plana",
                statement="Qual é a soma dos ângulos internos de um pentágono convexo?",
                option_a="360°",
                option_b="540°",
                option_c="720°",
                option_d="450°",
                correct_option="B",
                explanation="A soma dos ângulos internos de um polígono de n lados é S = (n - 2) × 180°. Para n = 5: S = (5 - 2) × 180° = 3 × 180° = 540°.",
            ),
        ],
        topics_by_slug,
    )

    list4, q4 = _get_or_create_list(
        db,
        turma_em,
        carlos,
        "Avaliação Diagnóstica: Álgebra, Proporção e Estatística",
        "Simulado inicial do 1º ano do Ensino Médio envolvendo quadráticas, juros compostos e medidas estatísticas.",
        True,
        [
            QuestionSeed(
                topic_slug="equacoes-do-2-grau",
                statement="Considere a equação x² - 5x - 14 = 0. Qual é a soma das suas duas raízes reais?",
                option_a="-5",
                option_b="5",
                option_c="14",
                option_d="-14",
                correct_option="B",
                explanation="Pelas relações de Girard, a soma das raízes é S = -b/a = -(-5)/1 = 5 (as raízes são 7 e -2, cuja soma é 5).",
            ),
            QuestionSeed(
                topic_slug="equacoes-do-2-grau",
                statement="Um retângulo tem área de 45 cm² e seu comprimento mede 4 cm a mais que a largura. Qual é a largura desse retângulo?",
                option_a="5 cm",
                option_b="9 cm",
                option_c="6 cm",
                option_d="4 cm",
                correct_option="A",
                explanation="Chamando a largura de x, o comprimento é x + 4. Logo x(x + 4) = 45 => x² + 4x - 45 = 0 => (x + 9)(x - 5) = 0. Como medida é positiva, x = 5 cm.",
            ),
            QuestionSeed(
                topic_slug="porcentagem-e-proporcao",
                statement="Um capital de R$ 2.000,00 recebeu um aumento de 10% no primeiro mês e, sobre o novo valor, mais 10% no segundo mês. Qual é o montante final?",
                option_a="R$ 2.400,00",
                option_b="R$ 2.200,00",
                option_c="R$ 2.420,00",
                option_d="R$ 2.440,00",
                correct_option="C",
                explanation="No 1º mês: 2000 × 1,10 = R$ 2.200,00. No 2º mês aplicamos 10% sobre R$ 2.200,00: 2200 × 1,10 = R$ 2.420,00 (aumento acumulado de 21%).",
            ),
            QuestionSeed(
                topic_slug="probabilidade-e-estatistica",
                statement="Considere o conjunto de dados ordenados: {12, 15, 15, 18, 22, 26, 30}. Qual é a mediana e a moda desse conjunto, respectivamente?",
                option_a="15 e 18",
                option_b="18 e 15",
                option_c="19,7 e 15",
                option_d="18 e 30",
                correct_option="B",
                explanation="Com 7 elementos ordenados, a mediana é o 4º termo central (18). A moda é o valor que mais se repete (15, que aparece duas vezes).",
            ),
            QuestionSeed(
                topic_slug="probabilidade-e-estatistica",
                statement="Ao lançar dois dados comuns de 6 faces simultaneamente, qual é a probabilidade de a soma dos resultados ser igual a 7?",
                option_a="1/12",
                option_b="1/9",
                option_c="5/36",
                option_d="1/6",
                correct_option="D",
                explanation="Há 6 × 6 = 36 resultados possíveis. Os pares que somam 7 são (1,6), (2,5), (3,4), (4,3), (5,2) e (6,1), totalizando 6 casos. Logo P = 6/36 = 1/6.",
            ),
        ],
        topics_by_slug,
    )

    _get_or_create_list(
        db,
        turma_a,
        ana,
        "Rascunho: Desafios de Revisão Final",
        "Lista em preparação (ainda não publicada para os alunos) com revisão geral.",
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
                explanation="Escrevemos 0,375 = 375/1000. Dividindo numerador e denominador por 125, obtemos 3/8.",
            ),
            QuestionSeed(
                topic_slug="porcentagem-e-proporcao",
                statement="Em uma sala com 40 estudantes, 28 gostam de álgebra. Qual porcentagem da turma gosta de álgebra?",
                option_a="60%",
                option_b="65%",
                option_c="70%",
                option_d="75%",
                correct_option="C",
                explanation="Dividimos 28 por 40: 28/40 = 7/10 = 0,70 = 70%.",
            ),
            QuestionSeed(
                topic_slug="equacoes-do-1-grau",
                statement="Qual é o valor de x em 5x - 11 = 2x + 10?",
                option_a="5",
                option_b="7",
                option_c="9",
                option_d="3",
                correct_option="B",
                explanation="Subtraindo 2x e somando 11 em ambos os lados: 3x = 21 => x = 7.",
            ),
        ],
        topics_by_slug,
    )

    now = datetime.now(UTC)

    # Lucas: List 1 (attempt 1: 3/6 = 50%, consumed retake -> attempt 2: 5/6 = 83.33%)
    # Correct keys for List 1: ["B", "C", "A", "D", "C", "A"]
    _ensure_submission(
        db,
        list1,
        q1,
        lucas,
        attempt_number=1,
        selected_options=["A", "B", "A", "A", "C", "A"],  # 3/6 = 50% (errou frações e proporção)
        submitted_at=now - timedelta(days=5),
        teacher=ana,
        teacher_comment="Bom raciocínio em equações do 1º grau, Lucas! Revise MMC de frações e grandezas inversamente proporcionais antes de refazer.",
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

    # Lucas: List 2 (attempt 1: 3/5 = 60%, pending retake)
    # Correct keys for List 2: ["B", "C", "A", "D", "B"]
    _ensure_submission(
        db,
        list2,
        q2,
        lucas,
        attempt_number=1,
        selected_options=["B", "A", "D", "D", "B"],  # 3/5 = 60% (errou 2 de geometria)
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

    # Lucas: List 3 (attempt 1: 4/5 = 80%)
    # Correct keys for List 3: ["C", "A", "B", "D", "B"]
    _ensure_submission(
        db,
        list3,
        q3,
        lucas,
        attempt_number=1,
        selected_options=["C", "A", "B", "A", "B"],  # 4/5 = 80%
        submitted_at=now - timedelta(days=1),
    )

    # Mariana: List 1 (100%), List 2 (80%), List 4 (80% + approved retake)
    _ensure_submission(
        db,
        list1,
        q1,
        mariana,
        attempt_number=1,
        selected_options=["B", "C", "A", "D", "C", "A"],  # 6/6 = 100%
        submitted_at=now - timedelta(days=4),
        teacher=ana,
        teacher_comment="Desempenho impecável, Mariana! Todos os cálculos e passos bem consolidados.",
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
    # Correct keys for List 4: ["B", "A", "C", "B", "D"]
    _ensure_submission(
        db,
        list4,
        q4,
        mariana,
        attempt_number=1,
        selected_options=["B", "A", "C", "B", "C"],  # 4/5 = 80%
        submitted_at=now - timedelta(days=1, hours=12),
        teacher=carlos,
        teacher_comment="Ótimo resultado inicial! Liberei uma nova tentativa caso queira revisar o espaço amostral dos dados.",
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

    # Gabriel: List 1 (2/6 = 33.33%), List 3 (2/5 = 40% + pending retake)
    _ensure_submission(
        db,
        list1,
        q1,
        gabriel,
        attempt_number=1,
        selected_options=["A", "A", "B", "B", "C", "A"],  # 2/6 = 33.33% (errou frações e porcentagem)
        submitted_at=now - timedelta(days=4),
        teacher=ana,
        teacher_comment="Gabriel, vamos reforçar frações e porcentagem nos plantões de quinta-feira antes da próxima lista.",
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

    # Sofia: List 1 (4/6 = 66.67%), List 2 (2/5 = 40%), List 4 (3/5 = 60%)
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
        selected_options=["A", "B", "C", "D", "B"],  # 2/5 = 40% (errou todas de geometria)
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
        selected_options=["B", "C", "C", "B", "A"],  # 3/5 = 60%
        submitted_at=now - timedelta(days=1),
    )

    db.commit()


def main() -> None:
    """CLI entrypoint to run idempotent database seeding."""
    with SessionLocal() as db:
        seed_database(db)
    print("Seed concluído com sucesso.")


if __name__ == "__main__":
    main()
