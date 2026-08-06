/*
  # Add Review Voting System

  1. Changes to Tables
    - Add `helpful_count` and `not_good_count` columns to `reviews` table
    - Create `review_votes` table for tracking individual user votes
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `review_id` (uuid, references reviews)
      - `vote_type` (text, either 'helpful' or 'not_good')
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `review_votes` table
    - Add policies for authenticated users to manage their votes
    - Add unique constraint to prevent duplicate votes
*/

-- Add vote count columns to reviews table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reviews' AND column_name = 'helpful_count'
  ) THEN
    ALTER TABLE reviews ADD COLUMN helpful_count integer DEFAULT 0 NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reviews' AND column_name = 'not_good_count'
  ) THEN
    ALTER TABLE reviews ADD COLUMN not_good_count integer DEFAULT 0 NOT NULL;
  END IF;
END $$;

-- Create review_votes table
CREATE TABLE IF NOT EXISTS review_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  review_id uuid REFERENCES reviews(id) ON DELETE CASCADE NOT NULL,
  vote_type text NOT NULL CHECK (vote_type IN ('helpful', 'not_good')),
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, review_id)
);

ALTER TABLE review_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all votes"
  ON review_votes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own votes"
  ON review_votes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own votes"
  ON review_votes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own votes"
  ON review_votes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create function to update vote counts
CREATE OR REPLACE FUNCTION update_review_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vote_type = 'helpful' THEN
      UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = NEW.review_id;
    ELSIF NEW.vote_type = 'not_good' THEN
      UPDATE reviews SET not_good_count = not_good_count + 1 WHERE id = NEW.review_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.vote_type = 'helpful' THEN
      UPDATE reviews SET helpful_count = helpful_count - 1 WHERE id = OLD.review_id;
    ELSIF OLD.vote_type = 'not_good' THEN
      UPDATE reviews SET not_good_count = not_good_count - 1 WHERE id = OLD.review_id;
    END IF;
    IF NEW.vote_type = 'helpful' THEN
      UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = NEW.review_id;
    ELSIF NEW.vote_type = 'not_good' THEN
      UPDATE reviews SET not_good_count = not_good_count + 1 WHERE id = NEW.review_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.vote_type = 'helpful' THEN
      UPDATE reviews SET helpful_count = helpful_count - 1 WHERE id = OLD.review_id;
    ELSIF OLD.vote_type = 'not_good' THEN
      UPDATE reviews SET not_good_count = not_good_count - 1 WHERE id = OLD.review_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for vote count updates
DROP TRIGGER IF EXISTS review_vote_count_trigger ON review_votes;
CREATE TRIGGER review_vote_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON review_votes
  FOR EACH ROW
  EXECUTE FUNCTION update_review_vote_counts();
