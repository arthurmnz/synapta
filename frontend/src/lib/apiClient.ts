import type {
  AnalyticsScope,
  AvailableClassroomOut,
  EnrollmentOut,
  EntityId,
  ListTypeFilter,
  LoginPayload,
  OrganizationCreatePayload,
  OrganizationMembershipOut,
  OrganizationUpdatePayload,
  RegisterPayload,
  RetakeRequestOut,
  StudentClassroomOut,
  StudentListDetailOut,
  StudentListScopeFilter,
  StudentListSummaryOut,
  StudentOrganizationOut,
  StudentSubmissionSummaryOut,
  SubmissionFeedbackOut,
  SubmitQuizPayload,
  TeacherClassroomOut,
  TeacherClassroomPayload,
  TeacherListCreatePayload,
  TeacherListDetailOut,
  TeacherListSummaryOut,
  TeacherListUpdatePayload,
  TeacherOrganizationOut,
  TeacherQuestionCreatePayload,
  TeacherQuestionOut,
  TeacherQuestionUpdatePayload,
  TeacherStudentDetailOut,
  TeacherStudentSummaryOut,
  TeacherTopicAnalyticsOut,
  TokenResponse,
  TopicCreatePayload,
  TopicOut,
  UserOut,
} from '../types/api';

const TOKEN_STORAGE_KEY = 'synapta_access_token';

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const API_BASE_URL = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;

export class ApiError extends Error {
  status: number;
  detail: unknown;
  code: string | null;

  constructor(message: string, status: number, detail?: unknown, code: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.code = code;
  }
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors in restricted environments
  }
}

type UnauthorizedListener = () => void;
let unauthorizedListener: UnauthorizedListener | null = null;

export function registerUnauthorizedListener(listener: UnauthorizedListener | null): void {
  unauthorizedListener = listener;
}

function parseErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.detail === 'string' && record.detail.trim()) {
      return record.detail;
    }
    if (Array.isArray(record.detail) && record.detail.length > 0) {
      const messages = record.detail
        .map((item) => {
          if (item && typeof item === 'object' && 'msg' in item) {
            const msg = String((item as { msg: unknown }).msg);
            return msg.replace(/^Value error,\s*/i, '');
          }
          return null;
        })
        .filter((msg): msg is string => Boolean(msg));
      if (messages.length > 0) {
        return messages.join(' ');
      }
    }
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message;
    }
  }

  switch (status) {
    case 400:
      return 'Os dados enviados são inválidos. Revise os campos e tente novamente.';
    case 401:
      return 'Sessão expirada ou credenciais inválidas. Faça login novamente.';
    case 403:
      return 'Você não tem permissão para realizar esta ação.';
    case 404:
      return 'O recurso solicitado não foi encontrado.';
    case 409:
      return 'Conflito de estado ao processar a solicitação.';
    case 422:
      return 'Alguns campos estão inválidos ou incompletos.';
    default:
      return 'Não foi possível concluir a requisição. Tente novamente em instantes.';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers: customHeaders, skipAuth = false, ...rest } = options;
  const headers = new Headers(customHeaders);

  if (body !== undefined && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (!skipAuth) {
    const token = getStoredToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers,
      body:
        body !== undefined && !(body instanceof FormData)
          ? JSON.stringify(body)
          : (body as BodyInit | undefined),
    });
  } catch {
    throw new ApiError(
      'Falha de conexão com o servidor. Verifique sua rede e tente novamente.',
      0
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  let parsedBody: unknown = null;

  if (isJson) {
    try {
      parsedBody = await response.json();
    } catch {
      parsedBody = null;
    }
  } else {
    const text = await response.text().catch(() => '');
    parsedBody = text ? { detail: text } : null;
  }

  if (!response.ok) {
    if (response.status === 401 && !skipAuth && unauthorizedListener) {
      unauthorizedListener();
    }
    const errorCode =
      parsedBody &&
      typeof parsedBody === 'object' &&
      'code' in parsedBody &&
      typeof (parsedBody as Record<string, unknown>).code === 'string'
        ? (parsedBody as Record<string, string>).code
        : null;
    throw new ApiError(
      parseErrorMessage(parsedBody, response.status),
      response.status,
      parsedBody,
      errorCode
    );
  }

  return parsedBody as T;
}

function buildQuery(params: Record<string, EntityId | string | undefined | null>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      sp.set(key, String(value));
    }
  });
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export interface TeacherListFilterParams {
  organizationId?: EntityId | null;
  classroomId?: EntityId | null;
  listType?: ListTypeFilter;
}

export interface TeacherHierarchyFilterParams {
  organizationId?: EntityId | null;
  classroomId?: EntityId | null;
  listId?: EntityId | null;
  listType?: ListTypeFilter;
}

export interface StudentListFilterParams {
  organizationId?: EntityId | null;
  classroomId?: EntityId | null;
  scope?: StudentListScopeFilter;
}

export const apiClient = {
  get<T>(path: string, options?: { skipAuth?: boolean }): Promise<T> {
    return request<T>(path, {
      method: 'GET',
      skipAuth: options?.skipAuth ?? false,
    });
  },

  // Auth
  register(payload: RegisterPayload): Promise<TokenResponse> {
    return request<TokenResponse>('/auth/register', {
      method: 'POST',
      body: payload,
      skipAuth: true,
    });
  },
  login(payload: LoginPayload): Promise<TokenResponse> {
    return request<TokenResponse>('/auth/login', {
      method: 'POST',
      body: payload,
      skipAuth: true,
    });
  },
  me(): Promise<UserOut> {
    return request<UserOut>('/auth/me');
  },

  // Topics
  getTopics(): Promise<TopicOut[]> {
    return request<TopicOut[]>('/topics');
  },

  // Student - Organizations & Classrooms
  getStudentOrganizations(): Promise<StudentOrganizationOut[]> {
    return request<StudentOrganizationOut[]>('/student/organizations');
  },
  joinStudentOrganization(
    orgId: EntityId,
    accessCode?: string | null
  ): Promise<OrganizationMembershipOut> {
    return request<OrganizationMembershipOut>(`/student/organizations/${orgId}/join`, {
      method: 'POST',
      body: accessCode ? { access_code: accessCode } : {},
    });
  },
  getStudentOrganizationClassrooms(orgId: EntityId): Promise<AvailableClassroomOut[]> {
    return request<AvailableClassroomOut[]>(`/student/organizations/${orgId}/classrooms`);
  },
  getStudentClassrooms(): Promise<StudentClassroomOut[]> {
    return request<StudentClassroomOut[]>('/student/classrooms');
  },
  getAvailableClassrooms(organizationId?: EntityId | null): Promise<AvailableClassroomOut[]> {
    return request<AvailableClassroomOut[]>(
      `/student/classrooms/available${buildQuery({ organization_id: organizationId })}`
    );
  },
  enrollInClassroom(
    classroomId: EntityId,
    accessCode?: string | null
  ): Promise<EnrollmentOut> {
    return request<EnrollmentOut>(`/student/classrooms/${classroomId}/enroll`, {
      method: 'POST',
      body: accessCode ? { access_code: accessCode } : {},
    });
  },

  // Student - Lists & Submissions
  getStudentLists(
    params?: StudentListFilterParams | EntityId | null
  ): Promise<StudentListSummaryOut[]> {
    const normalized: StudentListFilterParams =
      params && typeof params === 'object' ? params : { classroomId: params };
    return request<StudentListSummaryOut[]>(
      `/student/lists${buildQuery({
        organization_id: normalized.organizationId,
        classroom_id: normalized.classroomId,
        scope: normalized.scope,
      })}`
    );
  },
  getStudentListDetail(listId: EntityId): Promise<StudentListDetailOut> {
    return request<StudentListDetailOut>(`/student/lists/${listId}`);
  },
  unlockStudentList(listId: EntityId, accessCode: string): Promise<StudentListDetailOut> {
    return request<StudentListDetailOut>(`/student/lists/${listId}/unlock`, {
      method: 'POST',
      body: { access_code: accessCode },
    });
  },
  submitQuiz(listId: EntityId, payload: SubmitQuizPayload): Promise<SubmissionFeedbackOut> {
    return request<SubmissionFeedbackOut>(`/student/lists/${listId}/submit`, {
      method: 'POST',
      body: payload,
    });
  },
  getStudentSubmissions(): Promise<StudentSubmissionSummaryOut[]> {
    return request<StudentSubmissionSummaryOut[]>('/student/submissions');
  },
  getStudentSubmissionDetail(submissionId: EntityId): Promise<SubmissionFeedbackOut> {
    return request<SubmissionFeedbackOut>(`/student/submissions/${submissionId}`);
  },
  requestRetake(listId: EntityId, reason?: string): Promise<RetakeRequestOut> {
    return request<RetakeRequestOut>(`/student/lists/${listId}/retake-request`, {
      method: 'POST',
      body: reason?.trim() ? { reason: reason.trim() } : {},
    });
  },

  // Teacher - Topics
  createTopic(payload: TopicCreatePayload): Promise<TopicOut> {
    return request<TopicOut>('/teacher/topics', {
      method: 'POST',
      body: payload,
    });
  },

  // Teacher - Organizations
  getTeacherOrganizations(): Promise<TeacherOrganizationOut[]> {
    return request<TeacherOrganizationOut[]>('/teacher/organizations');
  },
  createTeacherOrganization(
    payload: OrganizationCreatePayload
  ): Promise<TeacherOrganizationOut> {
    return request<TeacherOrganizationOut>('/teacher/organizations', {
      method: 'POST',
      body: payload,
    });
  },
  updateTeacherOrganization(
    orgId: EntityId,
    payload: OrganizationUpdatePayload
  ): Promise<TeacherOrganizationOut> {
    return request<TeacherOrganizationOut>(`/teacher/organizations/${orgId}`, {
      method: 'PATCH',
      body: payload,
    });
  },
  deleteTeacherOrganization(orgId: EntityId): Promise<void> {
    return request<void>(`/teacher/organizations/${orgId}`, {
      method: 'DELETE',
    });
  },
  joinTeacherOrganization(
    orgId: EntityId,
    accessCode?: string | null
  ): Promise<OrganizationMembershipOut> {
    return request<OrganizationMembershipOut>(`/teacher/organizations/${orgId}/join`, {
      method: 'POST',
      body: accessCode ? { access_code: accessCode } : {},
    });
  },
  getTeacherOrganizationClassrooms(orgId: EntityId): Promise<TeacherClassroomOut[]> {
    return request<TeacherClassroomOut[]>(`/teacher/organizations/${orgId}/classrooms`);
  },

  // Teacher - Classrooms
  getTeacherClassrooms(organizationId?: EntityId | null): Promise<TeacherClassroomOut[]> {
    return request<TeacherClassroomOut[]>(
      `/teacher/classrooms${buildQuery({ organization_id: organizationId })}`
    );
  },
  createClassroom(payload: TeacherClassroomPayload): Promise<TeacherClassroomOut> {
    return request<TeacherClassroomOut>('/teacher/classrooms', {
      method: 'POST',
      body: payload,
    });
  },
  updateClassroom(
    classroomId: EntityId,
    payload: Partial<TeacherClassroomPayload>
  ): Promise<TeacherClassroomOut> {
    return request<TeacherClassroomOut>(`/teacher/classrooms/${classroomId}`, {
      method: 'PATCH',
      body: payload,
    });
  },
  deleteClassroom(classroomId: EntityId): Promise<void> {
    return request<void>(`/teacher/classrooms/${classroomId}`, {
      method: 'DELETE',
    });
  },

  // Teacher - Lists & Questions
  getTeacherLists(
    params?: TeacherListFilterParams | EntityId | null
  ): Promise<TeacherListSummaryOut[]> {
    const normalized: TeacherListFilterParams =
      params && typeof params === 'object' ? params : { classroomId: params };
    return request<TeacherListSummaryOut[]>(
      `/teacher/lists${buildQuery({
        organization_id: normalized.organizationId,
        classroom_id: normalized.classroomId,
        list_type: normalized.listType,
      })}`
    );
  },
  createList(payload: TeacherListCreatePayload): Promise<TeacherListDetailOut> {
    return request<TeacherListDetailOut>('/teacher/lists', {
      method: 'POST',
      body: payload,
    });
  },
  getTeacherListDetail(listId: EntityId): Promise<TeacherListDetailOut> {
    return request<TeacherListDetailOut>(`/teacher/lists/${listId}`);
  },
  updateList(
    listId: EntityId,
    payload: TeacherListUpdatePayload
  ): Promise<TeacherListDetailOut> {
    return request<TeacherListDetailOut>(`/teacher/lists/${listId}`, {
      method: 'PATCH',
      body: payload,
    });
  },
  deleteList(listId: EntityId): Promise<void> {
    return request<void>(`/teacher/lists/${listId}`, {
      method: 'DELETE',
    });
  },
  createQuestion(
    listId: EntityId,
    payload: TeacherQuestionCreatePayload
  ): Promise<TeacherQuestionOut> {
    return request<TeacherQuestionOut>(`/teacher/lists/${listId}/questions`, {
      method: 'POST',
      body: payload,
    });
  },
  updateQuestion(
    questionId: EntityId,
    payload: TeacherQuestionUpdatePayload
  ): Promise<TeacherQuestionOut> {
    return request<TeacherQuestionOut>(`/teacher/questions/${questionId}`, {
      method: 'PATCH',
      body: payload,
    });
  },
  deleteQuestion(questionId: EntityId): Promise<void> {
    return request<void>(`/teacher/questions/${questionId}`, {
      method: 'DELETE',
    });
  },

  // Teacher - Analytics & Students
  getTopicAnalytics(params?: {
    organizationId?: EntityId | null;
    classroomId?: EntityId | null;
    listId?: EntityId | null;
    listType?: ListTypeFilter;
    scope?: AnalyticsScope;
  }): Promise<TeacherTopicAnalyticsOut> {
    return request<TeacherTopicAnalyticsOut>(
      `/teacher/analytics/topics${buildQuery({
        organization_id: params?.organizationId,
        classroom_id: params?.classroomId,
        list_id: params?.listId,
        list_type: params?.listType,
        scope: params?.scope ?? 'latest',
      })}`
    );
  },
  getTeacherStudents(
    params?: TeacherHierarchyFilterParams | EntityId | null
  ): Promise<TeacherStudentSummaryOut[]> {
    const normalized: TeacherHierarchyFilterParams =
      params && typeof params === 'object' ? params : { classroomId: params };
    return request<TeacherStudentSummaryOut[]>(
      `/teacher/students${buildQuery({
        organization_id: normalized.organizationId,
        classroom_id: normalized.classroomId,
        list_id: normalized.listId,
        list_type: normalized.listType,
      })}`
    );
  },
  getTeacherStudentDetail(
    studentId: EntityId,
    params?: TeacherHierarchyFilterParams | EntityId | null
  ): Promise<TeacherStudentDetailOut> {
    const normalized: TeacherHierarchyFilterParams =
      params && typeof params === 'object' ? params : { classroomId: params };
    return request<TeacherStudentDetailOut>(
      `/teacher/students/${studentId}${buildQuery({
        organization_id: normalized.organizationId,
        classroom_id: normalized.classroomId,
        list_id: normalized.listId,
        list_type: normalized.listType,
      })}`
    );
  },
  getTeacherSubmissionDetail(submissionId: EntityId): Promise<SubmissionFeedbackOut> {
    return request<SubmissionFeedbackOut>(`/teacher/submissions/${submissionId}`);
  },
  updateSubmissionComment(
    submissionId: EntityId,
    teacherComment: string | null
  ): Promise<SubmissionFeedbackOut> {
    return request<SubmissionFeedbackOut>(`/teacher/submissions/${submissionId}/comment`, {
      method: 'PATCH',
      body: { teacher_comment: teacherComment },
    });
  },
  getRetakeRequests(
    status: 'pending' | 'approved' | 'rejected' | '' = 'pending'
  ): Promise<RetakeRequestOut[]> {
    return request<RetakeRequestOut[]>(`/teacher/retake-requests${buildQuery({ status })}`);
  },
  decideRetakeRequest(
    requestId: EntityId,
    decision: 'approved' | 'rejected'
  ): Promise<RetakeRequestOut> {
    return request<RetakeRequestOut>(`/teacher/retake-requests/${requestId}/decide`, {
      method: 'POST',
      body: { decision },
    });
  },
  authorizeStudentRetake(listId: EntityId, studentId: EntityId): Promise<RetakeRequestOut> {
    return request<RetakeRequestOut>(
      `/teacher/lists/${listId}/students/${studentId}/authorize-retake`,
      {
        method: 'POST',
        body: {},
      }
    );
  },
};
