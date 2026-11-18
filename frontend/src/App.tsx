import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "./components/AppLayout";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { CoursePage } from "./pages/CoursePage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { PracticePage } from "./pages/PracticePage";
import { RecoveryPlanPage } from "./pages/RecoveryPlanPage";
import { ExamResultsPage, MyReportPage, StudentReportPage } from "./pages/ReportPages";
import { RetestPage, RetestResultsPage } from "./pages/RetestPages";
import { SlideViewerPage } from "./pages/SlideViewerPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="courses/:courseId" element={<CoursePage />} />
        <Route path="courses/:courseId/analytics" element={<AnalyticsPage />} />
        <Route path="materials/:materialId/pages/:page" element={<SlideViewerPage />} />
        <Route path="exams/:examId/report" element={<MyReportPage />} />
        <Route path="exams/:examId/results" element={<ExamResultsPage />} />
        <Route path="exams/:examId/students/:studentId" element={<StudentReportPage />} />
        <Route path="plans/:planId" element={<RecoveryPlanPage />} />
        <Route path="plans/:planId/practice/:conceptId" element={<PracticePage />} />
        <Route path="retests/:retestId" element={<RetestPage />} />
        <Route path="retests/:retestId/results" element={<RetestResultsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
