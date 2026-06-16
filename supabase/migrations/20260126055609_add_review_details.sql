/*
  # レビュー詳細項目の追加

  ## 変更内容
  
  ### `reviews`テーブルに以下のカラムを追加:
  - `difficulty` (integer) - 難易度（1-5: 1=簡単、5=難しい）
  - `homework_amount` (integer) - 宿題の多さ（1-5: 1=少ない、5=多い）
  - `support_quality` (integer) - サポートの良さ（1-5: 1=悪い、5=良い）
  - `attendance_required` (boolean) - 出席確認（true=はい、false=いいえ）
  
  ## 注意事項
  - 既存の`rating`カラムは「おすすめ度」として使用
  - すべての新規カラムは必須（NOT NULL）
  - 既存データとの互換性のため、デフォルト値を設定
*/

-- 新しいカラムを追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reviews' AND column_name = 'difficulty'
  ) THEN
    ALTER TABLE reviews ADD COLUMN difficulty integer NOT NULL DEFAULT 3 CHECK (difficulty >= 1 AND difficulty <= 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reviews' AND column_name = 'homework_amount'
  ) THEN
    ALTER TABLE reviews ADD COLUMN homework_amount integer NOT NULL DEFAULT 3 CHECK (homework_amount >= 1 AND homework_amount <= 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reviews' AND column_name = 'support_quality'
  ) THEN
    ALTER TABLE reviews ADD COLUMN support_quality integer NOT NULL DEFAULT 3 CHECK (support_quality >= 1 AND support_quality <= 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reviews' AND column_name = 'attendance_required'
  ) THEN
    ALTER TABLE reviews ADD COLUMN attendance_required boolean NOT NULL DEFAULT false;
  END IF;
END $$;