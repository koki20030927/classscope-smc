/*
  # 出席確認フィールドをオンライン対応に変更

  ## 変更内容
  
  ### `reviews`テーブルの`attendance_required`カラムを変更:
  - 型を boolean から text に変更
  - 既存データを変換:
    - true → 'yes'（出席あり）
    - false → 'no'（出席なし）
  - 新しい値 'online'（オンライン・該当なし）を追加
  - CHECK制約で 'yes', 'no', 'online' のみ許可
  
  ## 注意事項
  - 既存データは自動的に変換されます
  - NOT NULL制約は維持されます
*/

-- 新しいテキスト型のカラムを追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reviews' AND column_name = 'attendance_type'
  ) THEN
    ALTER TABLE reviews ADD COLUMN attendance_type text;
  END IF;
END $$;

-- 既存のbooleanデータをtextに変換してコピー
UPDATE reviews
SET attendance_type = CASE
  WHEN attendance_required = true THEN 'yes'
  WHEN attendance_required = false THEN 'no'
  ELSE 'no'
END
WHERE attendance_type IS NULL;

-- NOT NULL制約を追加
ALTER TABLE reviews ALTER COLUMN attendance_type SET NOT NULL;

-- CHECK制約を追加（値を'yes', 'no', 'online'に限定）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reviews_attendance_type_check'
  ) THEN
    ALTER TABLE reviews ADD CONSTRAINT reviews_attendance_type_check
      CHECK (attendance_type IN ('yes', 'no', 'online'));
  END IF;
END $$;

-- 古いbooleanカラムを削除
ALTER TABLE reviews DROP COLUMN IF EXISTS attendance_required;

-- 新しいカラム名を attendance_required にリネーム
ALTER TABLE reviews RENAME COLUMN attendance_type TO attendance_required;