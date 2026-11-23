START TRANSACTION;

SET @ward59_id = (
  SELECT ward_id FROM wards WHERE ward_code = '59' LIMIT 1
);

SET @ward59_is_referenced = IF(
  @ward59_id IS NULL,
  0,
  EXISTS (
    SELECT 1 FROM evaluations
    WHERE ward_id = @ward59_id
  )
  OR EXISTS (
    SELECT 1
    FROM evaluations e
    JOIN beds b ON b.bed_id = e.bed_id
    WHERE b.ward_id = @ward59_id
  )
  OR EXISTS (
    SELECT 1 FROM survey_qr_wards
    WHERE ward_id = @ward59_id
  )
);

DELETE FROM beds
WHERE ward_id = @ward59_id
  AND @ward59_is_referenced = 0;

DELETE FROM wards
WHERE ward_id = @ward59_id
  AND @ward59_is_referenced = 0;

SELECT CASE
  WHEN @ward59_id IS NULL THEN 'Ward code 59 was not found.'
  WHEN @ward59_is_referenced = 1 THEN
    'Ward code 59 was not deleted because evaluations or QR codes reference it.'
  ELSE 'Ward code 59 and its beds were deleted.'
END AS result;

COMMIT;
