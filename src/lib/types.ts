export interface School {
  id: string;
  name: string;
  slug: string;
  short_name: string;
  is_active: boolean;
  created_at: string;
}

export interface Professor {
  id: string;
  school_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  school_id: string;
  code: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ProfessorCourse {
  id: string;
  school_id: string;
  professor_id: string;
  course_id: string;
  created_at: string;
}

export type ReviewSchemaVersion = 1 | 2;
export type ClassFormat = 'in_person' | 'online' | 'hybrid';
export type Semester = 'fall' | 'spring' | 'summer' | 'winter';

export interface Review {
  id: string;
  school_id: string;
  user_id: string | null;
  professor_id: string;
  course_id: string;
  review_schema_version: ReviewSchemaVersion;
  rating: number | null;
  difficulty: number | null;
  homework_amount: number | null;
  support_quality: number | null;
  attendance_required: 'yes' | 'no' | 'online' | null;
  professor_quality: number | null;
  easy_a: number | null;
  course_quality: number | null;
  recommendation: number | null;
  class_format: ClassFormat | null;
  year_taken: number | null;
  semester: Semester | null;
  content: string;
  is_imported: boolean;
  source_type: string | null;
  source_row_key: string | null;
  imported_at: string | null;
  helpful_count: number;
  not_good_count: number;
  created_at: string;
  updated_at: string;
}

export interface ReviewWithDetails extends Review {
  professors?: Professor;
  courses?: Course;
}

export interface ReviewVote {
  id: string;
  user_id: string;
  review_id: string;
  vote_type: 'helpful' | 'not_good';
  created_at: string;
}
