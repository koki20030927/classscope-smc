import { ReviewSchemaVersion } from './types';

export interface ReviewMetricInput {
  review_schema_version: ReviewSchemaVersion;
  rating: number | null;
  professor_quality: number | null;
  easy_a: number | null;
  course_quality: number | null;
  recommendation: number | null;
}

export interface ProfessorReviewMetrics {
  totalReviewCount: number;
  v2ReviewCount: number;
  legacyReviewCount: number;
  recommendationAverage: number | null;
  recommendationCount: number;
  recommendationDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
  professorQualityAverage: number | null;
  easyAAverage: number | null;
  courseQualityAverage: number | null;
  legacyAverageRating: number | null;
}

interface MetricAccumulator {
  sum: number;
  count: number;
}

const addMetric = (accumulator: MetricAccumulator, value: number | null) => {
  if (value !== null) {
    accumulator.sum += value;
    accumulator.count += 1;
  }
};

const average = ({ sum, count }: MetricAccumulator) => count > 0 ? sum / count : null;

export function calculateProfessorReviewMetrics(reviews: ReviewMetricInput[]): ProfessorReviewMetrics {
  const recommendation: MetricAccumulator = { sum: 0, count: 0 };
  const professorQuality: MetricAccumulator = { sum: 0, count: 0 };
  const easyA: MetricAccumulator = { sum: 0, count: 0 };
  const courseQuality: MetricAccumulator = { sum: 0, count: 0 };
  const legacyRating: MetricAccumulator = { sum: 0, count: 0 };
  const recommendationDistribution: ProfessorReviewMetrics['recommendationDistribution'] = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  let v2ReviewCount = 0;
  let legacyReviewCount = 0;

  for (const review of reviews) {
    if (review.review_schema_version === 2) {
      v2ReviewCount += 1;
      addMetric(professorQuality, review.professor_quality);
      addMetric(easyA, review.easy_a);
      addMetric(courseQuality, review.course_quality);
      addMetric(recommendation, review.recommendation);

      if (review.recommendation !== null) {
        recommendationDistribution[review.recommendation as 1 | 2 | 3 | 4 | 5] += 1;
      }
    } else {
      legacyReviewCount += 1;
      addMetric(legacyRating, review.rating);
    }
  }

  return {
    totalReviewCount: reviews.length,
    v2ReviewCount,
    legacyReviewCount,
    recommendationAverage: average(recommendation),
    recommendationCount: recommendation.count,
    recommendationDistribution,
    professorQualityAverage: average(professorQuality),
    easyAAverage: average(easyA),
    courseQualityAverage: average(courseQuality),
    legacyAverageRating: average(legacyRating),
  };
}
