-- =====================================================
-- DATABASE: hospital_special_room
-- Hospital Roi Et
-- React + Node.js + Express + MySQL
-- =====================================================

CREATE DATABASE IF NOT EXISTS hospital_special_room
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE hospital_special_room;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS problem_images;
DROP TABLE IF EXISTS problem_report_categories;
DROP TABLE IF EXISTS problem_categories;
DROP TABLE IF EXISTS problem_reports;
DROP TABLE IF EXISTS evaluation_scores;
DROP TABLE IF EXISTS evaluations;
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS buildings;
DROP TABLE IF EXISTS admins;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE buildings (
  building_id INT AUTO_INCREMENT PRIMARY KEY,
  building_code VARCHAR(30) NOT NULL UNIQUE,
  building_name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE rooms (
  room_id INT AUTO_INCREMENT PRIMARY KEY,
  building_id INT NOT NULL,
  room_number VARCHAR(30) NOT NULL,
  room_type VARCHAR(100) NULL,
  floor_number VARCHAR(20) NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_building_room (building_id, room_number),
  INDEX idx_room_building (building_id),
  CONSTRAINT fk_rooms_buildings
    FOREIGN KEY (building_id) REFERENCES buildings(building_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE admins (
  admin_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NULL,
  role ENUM('admin', 'super_admin') NOT NULL DEFAULT 'admin',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 1,
  last_login DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE evaluations (
  evaluation_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  evaluation_code VARCHAR(30) NOT NULL UNIQUE,
  room_id INT NOT NULL,
  respondent_type ENUM('patient', 'relative', 'other') NOT NULL,
  has_problem TINYINT(1) NOT NULL DEFAULT 0,
  overall_score DECIMAL(3,2) NOT NULL,
  suggestion TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_evaluation_room (room_id),
  INDEX idx_evaluation_date (created_at),
  INDEX idx_evaluation_problem (has_problem),
  CONSTRAINT fk_evaluations_rooms
    FOREIGN KEY (room_id) REFERENCES rooms(room_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_overall_score CHECK (overall_score >= 1 AND overall_score <= 5)
) ENGINE=InnoDB;

CREATE TABLE evaluation_scores (
  score_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  evaluation_id BIGINT NOT NULL,
  topic_code VARCHAR(50) NOT NULL,
  topic_name VARCHAR(150) NOT NULL,
  score TINYINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_evaluation_topic (evaluation_id, topic_code),
  INDEX idx_score_topic (topic_code),
  INDEX idx_score_value (score),
  CONSTRAINT fk_scores_evaluations
    FOREIGN KEY (evaluation_id) REFERENCES evaluations(evaluation_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_score_range CHECK (score BETWEEN 1 AND 5)
) ENGINE=InnoDB;

CREATE TABLE problem_categories (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  category_code VARCHAR(50) NOT NULL UNIQUE,
  category_name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE problem_reports (
  report_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  evaluation_id BIGINT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_report_date (created_at),
  CONSTRAINT fk_reports_evaluations
    FOREIGN KEY (evaluation_id) REFERENCES evaluations(evaluation_id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE problem_report_categories (
  report_category_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_id BIGINT NOT NULL,
  category_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_report_category (report_id, category_id),
  INDEX idx_report_category (category_id),
  CONSTRAINT fk_report_categories_reports
    FOREIGN KEY (report_id) REFERENCES problem_reports(report_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_report_categories_categories
    FOREIGN KEY (category_id) REFERENCES problem_categories(category_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE problem_images (
  image_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_id BIGINT NOT NULL,
  image_path VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL UNIQUE,
  mime_type VARCHAR(100) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_image_report (report_id),
  CONSTRAINT fk_images_reports
    FOREIGN KEY (report_id) REFERENCES problem_reports(report_id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO problem_categories (category_code, category_name, description) VALUES
  ('CLEANLINESS', 'ความสะอาด', 'ปัญหาความสะอาดภายในห้องพัก'),
  ('EQUIPMENT', 'อุปกรณ์ชำรุดหรือใช้งานไม่ได้', 'อุปกรณ์ภายในห้องชำรุดหรือไม่สามารถใช้งานได้'),
  ('INSUFFICIENT', 'อุปกรณ์หรือสิ่งของไม่เพียงพอ', 'สิ่งของหรืออุปกรณ์ภายในห้องมีไม่เพียงพอ'),
  ('ELECTRICAL', 'เครื่องปรับอากาศหรือระบบไฟฟ้า', 'ปัญหาเกี่ยวกับเครื่องปรับอากาศและระบบไฟฟ้า'),
  ('PLUMBING', 'ห้องน้ำหรือระบบประปา', 'ปัญหาเกี่ยวกับห้องน้ำและระบบน้ำ'),
  ('FACILITY', 'สิ่งอำนวยความสะดวก', 'ปัญหาเกี่ยวกับสิ่งอำนวยความสะดวก'),
  ('OTHER', 'อื่น ๆ', 'ปัญหาประเภทอื่นที่ไม่มีในรายการ');

INSERT INTO buildings (building_code, building_name, description, is_active) VALUES
  ('ward10', 'ศัลยกรรมพิเศษ 1', 'ศพ 1', 0),
  ('ward11', 'ศัลยกรรมพิเศษ 2', 'ศพ 2', 0),
  ('ward12', 'ศัลยกรรมพิเศษ 3', 'ศพ 3', 0),
  ('ward13', 'ศัลยกรรมพิเศษ 4', 'ศพ 4', 0),
  ('ward27', 'พิเศษอาคารมะเร็ง ชั้น 7', 'พอ 7', 1),
  ('ward29', 'พิเศษอาคารมะเร็ง ชั้น 8', 'พอ 8', 1),
  ('ward35', 'พิเศษอายุรกรรม 4', 'พอ 4', 1),
  ('ward43', 'พิเศษอายุรกรรม 5', 'พอ 5', 1),
  ('ward46', 'พิเศษสงฆ์ฯ ชั้น 3', 'พส.ช3', 1),
  ('ward47', 'พิเศษสงฆ์ฯ ชั้น 4', 'พส.ช4', 1),
  ('ward48', 'พิเศษสงฆ์ฯ ชั้น 5', 'พส.ช5', 1),
  ('ward49', 'พิเศษสงฆ์ฯ ชั้น 6', 'พส.ช6', 1),
  ('ward51', 'สูติกรรมพิเศษ', 'สูติ.พ', 1),
  ('ward55', 'พิเศษอายุรกรรม 6', 'พอ 6', 1);

INSERT INTO rooms (building_id, room_number, room_type, floor_number) VALUES
  (1, 'VIP1', 'ศัลยกรรมพิเศษ 1', ''),
  (1, 'VIP2', 'ศัลยกรรมพิเศษ 1', ''),
  (1, 'VIP3', 'ศัลยกรรมพิเศษ 1', ''),
  (1, 'VIP4', 'ศัลยกรรมพิเศษ 1', ''),
  (1, 'VIP5', 'ศัลยกรรมพิเศษ 1', ''),


