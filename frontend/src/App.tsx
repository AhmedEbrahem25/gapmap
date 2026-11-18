import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "./components/AppLayout";
import { CoursePage } from "./pages/CoursePage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { ExamResultsPage, MyReportPage, StudentReportPage } from "./pages/ReportPages";
import { SlideViewerPage } from "./pages/SlideViewerPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="courses/:courseId" element={<CoursePage />} />
        <Route path="materials/:materialId/pages/:page" element={<SlideViewerPage />} />
        <Route path="exams/:examId/report" element={<MyReportPage />} />
        <Route path="exams/:examId/results" element={<ExamResultsPage />} />
        <Route path="exams/:examId/students/:studentId" element={<StudentReportPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
