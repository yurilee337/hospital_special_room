-- Apply once after 20261111_ward_beds_qr.sql.
-- Existing QR codes remain Ward-level because bed_id is nullable.

ALTER TABLE survey_qr_codes
  ADD COLUMN bed_id INT NULL AFTER building_name,
  ADD INDEX idx_survey_qr_bed (bed_id),
  ADD CONSTRAINT fk_survey_qr_codes_bed
    FOREIGN KEY (bed_id) REFERENCES beds(bed_id)
    ON UPDATE CASCADE ON DELETE RESTRICT;
