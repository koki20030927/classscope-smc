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

export interface Review {
  id: string;
  school_id: string;
  user_id: string;
  professor_id: string;
  course_id: string;
  rating: number;
  difficulty: number;
  homework_amount: number;
  support_quality: number;
  attendance_required: 'yes' | 'no' | 'online';
  content: string;
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
