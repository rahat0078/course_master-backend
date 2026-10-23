const Course = require("../models/Course");
const Enrollment = require("../models/Enrollment");
const QuizSubmission = require("../models/QuizSubmission");

const submitQuiz = async (studentId, payload) => {
  const { courseId, lessonId, answers } = payload;
  // answers = [selectedIndex, selectedIndex, ...]

  const enrolled = await Enrollment.findOne({
    student: studentId,
    course: courseId,
  });
  if (!enrolled) throw new Error("You are not enrolled in this course");

  const course = await Course.findById(courseId);
  if (!course) throw new Error("Course not found");

  // find lesson quiz securely
  let quiz = null;
  let targetLesson = null;
  
  for (const mod of course.syllabus) {
    targetLesson = mod.lessons.id ? mod.lessons.id(lessonId) : mod.lessons.find(l => l._id.toString() === String(lessonId));
    if (targetLesson) {
      quiz = targetLesson.quiz || [];
      break;
    }
  }

  if (!targetLesson) throw new Error("Lesson not found");
  if (!quiz || quiz.length === 0) throw new Error("No quiz in this lesson");

  let score = 0;
  quiz.forEach((q, i) => {
    if (answers[i] === q.correctIndex) score++;
  });

  const total = quiz.length;
  const percent = Math.round((score / total) * 100);

  // Save quiz submission to database
  const submission = await QuizSubmission.create({
    student: studentId,
    course: courseId,
    lessonId,
    answers,
    score,
    total,
    percent,
  });

  if (!submission || !submission._id) {
    throw new Error("Failed to save quiz submission");
  }

  // ✅ Fix: Automatically mark lesson as completed in Enrollment progress if passing score (e.g., >= 50% or any completion)
  if (percent >= 50) {
    if (!enrolled.progress) {
      enrolled.progress = { completedLessons: [], percent: 0 };
    }
    
    if (!enrolled.progress.completedLessons.includes(lessonId)) {
      enrolled.progress.completedLessons.push(lessonId);
      
      // Calculate total course lessons to update percentage
      let totalLessonsCount = 0;
      course.syllabus.forEach(m => {
        if (m.lessons) totalLessonsCount += m.lessons.length;
      });

      if (totalLessonsCount > 0) {
        enrolled.progress.percent = Math.min(
          100,
          Math.round((enrolled.progress.completedLessons.length / totalLessonsCount) * 100)
        );
      }

      await enrolled.save();
    }
  }

  return {
    _id: submission._id,
    total,
    score,
    percent,
    createdAt: submission.createdAt,
  };
};

// Get quiz submissions for a student in a specific course
const getMyQuizSubmissions = async (studentId, courseId = null) => {
  const filter = { student: studentId };
  if (courseId) filter.course = courseId;

  return QuizSubmission.find(filter)
    .populate("course", "title")
    .sort({ createdAt: -1 });
};

// Get quiz statistics for a course
const getQuizStats = async (studentId, courseId) => {
  const submissions = await QuizSubmission.find({
    student: studentId,
    course: courseId,
  }).sort({ createdAt: -1 }); // Get most recent first

  if (submissions.length === 0) {
    return {
      average: 0,
      totalQuizzes: 0,
      submissions: [],
    };
  }

  // Group by lessonId and get only the most recent submission per lesson
  const latestSubmissions = {};
  submissions.forEach((sub) => {
    const lessonIdStr = String(sub.lessonId);
    if (
      !latestSubmissions[lessonIdStr] ||
      new Date(sub.createdAt) >
        new Date(latestSubmissions[lessonIdStr].createdAt)
    ) {
      latestSubmissions[lessonIdStr] = sub;
    }
  });

  const uniqueSubmissions = Object.values(latestSubmissions);
  const totalPercent = uniqueSubmissions.reduce((sum, s) => sum + s.percent, 0);
  const average = Math.round(totalPercent / uniqueSubmissions.length);

  return {
    average,
    totalQuizzes: uniqueSubmissions.length,
    submissions: uniqueSubmissions.map((s) => ({
      _id: s._id,
      lessonId: s.lessonId,
      score: s.score,
      total: s.total,
      percent: s.percent,
      submittedAt: s.createdAt,
    })),
  };
};

module.exports = { submitQuiz, getMyQuizSubmissions, getQuizStats };
