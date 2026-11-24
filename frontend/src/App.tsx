import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { StudentDashboardPage } from './pages/student/StudentDashboardPage';
import { StudentOrganizationsPage } from './pages/student/StudentOrganizationsPage';
import { StudentClassroomsPage } from './pages/student/StudentClassroomsPage';
import { StudentQuizPage } from './pages/student/StudentQuizPage';
import { StudentFeedbackPage } from './pages/student/StudentFeedbackPage';
import { StudentHistoryPage } from './pages/student/StudentHistoryPage';
import { TeacherDashboardPage } from './pages/teacher/TeacherDashboardPage';
import { TeacherOrganizationsPage } from './pages/teacher/TeacherOrganizationsPage';
import { TeacherClassroomsPage } from './pages/teacher/TeacherClassroomsPage';
import { TeacherListEditorPage } from './pages/teacher/TeacherListEditorPage';
import { TeacherStudentsPage } from './pages/teacher/TeacherStudentsPage';
import { TeacherStudentDetailPage } from './pages/teacher/TeacherStudentDetailPage';
import { TeacherSubmissionDetailPage } from './pages/teacher/TeacherSubmissionDetailPage';

function RootRedirect() {
  const { user, isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return null;
  }
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }
  return (
    <Navigate
      to={user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard'}
      replace
    />
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Student Routes */}
      <Route
        path="/student/dashboard"
        element={
          <ProtectedRoute allowedRole="student">
            <StudentDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/organizations"
        element={
          <ProtectedRoute allowedRole="student">
            <StudentOrganizationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/classrooms"
        element={
          <ProtectedRoute allowedRole="student">
            <StudentClassroomsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/lists/:listId"
        element={
          <ProtectedRoute allowedRole="student">
            <StudentQuizPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/submissions/:submissionId"
        element={
          <ProtectedRoute allowedRole="student">
            <StudentFeedbackPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/history"
        element={
          <ProtectedRoute allowedRole="student">
            <StudentHistoryPage />
          </ProtectedRoute>
        }
      />

      {/* Teacher Routes */}
      <Route
        path="/teacher/dashboard"
        element={
          <ProtectedRoute allowedRole="teacher">
            <TeacherDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/organizations"
        element={
          <ProtectedRoute allowedRole="teacher">
            <TeacherOrganizationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/classrooms"
        element={
          <ProtectedRoute allowedRole="teacher">
            <TeacherClassroomsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/lists/:listId"
        element={
          <ProtectedRoute allowedRole="teacher">
            <TeacherListEditorPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/students"
        element={
          <ProtectedRoute allowedRole="teacher">
            <TeacherStudentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/students/:studentId"
        element={
          <ProtectedRoute allowedRole="teacher">
            <TeacherStudentDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/submissions/:submissionId"
        element={
          <ProtectedRoute allowedRole="teacher">
            <TeacherSubmissionDetailPage />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
