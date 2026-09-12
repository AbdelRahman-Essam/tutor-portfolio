'use strict';
const fs = require('fs');
const path = require('path');
const { stringifyCSV } = require('./csv');

const headers = [
  'Timestamp', 'Email Address', 'Full Name', 'Professional Title', 'Profile Photo',
  'Preferred Profile Key', 'Professional Summary', 'Teaching Philosophy',
  'Teaching Specializations', 'Student Age Groups', 'Student Levels', 'Teaching Format',
  'Years of Teaching Experience', 'Teaching Experience', 'Current Availability',
  'Languages You Can Communicate/Teach In', 'English Proficiency', 'Other Language Proficiency',
  'Teaching & Technology Skills', 'Professional Email', 'WhatsApp Number', 'Phone Number',
  'Telegram', 'Facebook', 'Instagram', 'LinkedIn', 'Personal Website',
  'Video 1 — Title', 'Video 1 — Type', 'Video 1 — Description', 'Video 1 — YouTube/GoogleDrive URL', 'Do you want to add another Video',
  'Video 2 — Title', 'Video 2 — Type', 'Video 2 — Description', 'Video 2 — YouTube/GoogleDrive URL', 'Do you want to add another Video',
  'Video 3 — Title', 'Video 3 — Type', 'Video 3 — Description', 'Video 3 — YouTube/GoogleDrive URL', 'Do you want to add another Video',
  'Video 4 — Title', 'Video 4 — Type', 'Video 4 — Description', 'Video 4 — YouTube/GoogleDrive URL', 'Do you want to add another Video',
  'Video 5 — Title', 'Video 5 — Type', 'Video 5 — Description', 'Video 5 — YouTube/GoogleDrive URL',
  'Certificate 1 — Name', 'Certificate 1 — Issuing Organization', 'Certificate 1 — Date', 'Certificate 1 — Description', 'Certificate 1 — File', 'Do you want to add another Certificate?',
  'Certificate 2 — Name', 'Certificate 2 — Issuing Organization', 'Certificate 2 — Date', 'Certificate 2 — Description', 'Certificate 2 — File', 'Do you want to add another Certificate?',
  'Certificate 3 — Name', 'Certificate 3 — Issuing Organization', 'Certificate 3 — Date', 'Certificate 3 — Description', 'Certificate 3 — File', 'Do you want to add another Certificate?',
  'Certificate 4 — Name', 'Certificate 4 — Issuing Organization', 'Certificate 4 — Date', 'Certificate 4 — Description', 'Certificate 4 — File', 'Do you want to add another Certificate?',
  'Certificate 5 — Name', 'Certificate 5 — Issuing Organization', 'Certificate 5 — Date', 'Certificate 5 — Description', 'Certificate 5 — File', 'Do you want to add another Certificate?',
  'Certificate 6 — Name', 'Certificate 6 — Issuing Organization', 'Certificate 6 — Date', 'Certificate 6 — Description', 'Certificate 6 — File', 'Do you want to add another Certificate?',
  'Certificate 7 — Name', 'Certificate 7 — Issuing Organization', 'Certificate 7 — Date', 'Certificate 7 — Description', 'Certificate 7 — File', 'Do you want to add another Certificate?',
  'Preferred Profile Theme', 'Profile Visibility', 'Publication Consent', 'Information Accuracy',
  // --- admin columns we're adding on top of the raw form sheet ---
  'Status', 'Featured', 'Admin Notes'
];

const ahmed = {
  'Timestamp': '9/12/2026 7:25:41',
  'Email Address': 'eng.abdelrahman.essam2022@gmail.com',
  'Full Name': 'Ahmed Mohamed',
  'Professional Title': 'English & Islamic English Tutor',
  'Profile Photo': 'https://drive.google.com/open?id=1jW88T_hpzjdktM-CvSL3Dw5xRgtQ23Ih',
  'Preferred Profile Key': 'ahmed-mohamed',
  'Professional Summary': 'I am an English tutor with five years of experience helping children, teenagers, and adults improve their English communication skills. I focus on practical speaking, vocabulary, and confidence-building activities. I also enjoy teaching English through Islamic topics and everyday situations.',
  'Teaching Philosophy': 'I believe students learn best when lessons are simple, practical, and engaging. I encourage students to speak, ask questions, and practice English in meaningful situations.',
  'Teaching Specializations': 'General English, Conversational English, English for Adults, Business English, Islamic Studies in English, Quran-related English, English for Non-Native Speakers',
  'Student Age Groups': 'Children, Teenagers, Adults',
  'Student Levels': 'Beginner, Elementary, Intermediate, Upper Intermediate',
  'Teaching Format': 'Online',
  'Years of Teaching Experience': '5',
  'Teaching Experience': 'I have five years of experience teaching English to children, teenagers, and adults through private lessons and online classes. I have helped students improve their speaking, vocabulary, grammar, and everyday communication skills.',
  'Current Availability': 'Accepting new students',
  'Languages You Can Communicate/Teach In': 'Arabic, English',
  'English Proficiency': 'Fluent',
  'Other Language Proficiency': 'Arabic — Native',
  'Teaching & Technology Skills': 'Zoom, Google Meet, Microsoft Teams, Google Classroom, PowerPoint, Video Editing',
  'Professional Email': 'ahmed.tutor@example.com',
  'WhatsApp Number': '+201012345678',
  'Phone Number': '+201012345678',
  'Telegram': '@ahmedtutor',
  'Facebook': 'https://facebook.com/ahmed.tutor',
  'Instagram': 'https://instagram.com/ahmed.tutor',
  'LinkedIn': 'https://linkedin.com/in/ahmed-tutor',
  'Personal Website': '',
  'Video 1 — Title': 'About Me',
  'Video 1 — Type': 'Introduction / About Me',
  'Video 1 — Description': 'A short introduction about my teaching experience, interests, and approach to teaching English.',
  'Video 1 — YouTube/GoogleDrive URL': 'https://www.youtube.com/watch?v=3QYC2oXTdUA',
  'Video 2 — Title': 'My Teaching Style',
  'Video 2 — Type': 'Teaching Style',
  'Video 2 — Description': 'A short video explaining how I make English lessons interactive and practical for students.',
  'Video 2 — YouTube/GoogleDrive URL': 'https://www.youtube.com/watch?v=S7uKF02bD-4',
  'Video 3 — Title': 'Sample English Lesson',
  'Video 3 — Type': 'Sample English Lesson',
  'Video 3 — Description': 'A short demonstration of an English lesson for intermediate-level students.',
  'Video 3 — YouTube/GoogleDrive URL': 'https://drive.google.com/file/d/1RtwkxAw7yNnkrmhErnw0kheX_6MlvLA7/view?usp=sharing',
  'Certificate 1 — Name': 'TESOL Certificate',
  'Certificate 1 — Issuing Organization': 'International TESOL Institute',
  'Certificate 1 — Date': '6/11/2024',
  'Certificate 1 — Description': 'Professional qualification in teaching English to speakers of other languages.',
  'Certificate 1 — File': 'https://drive.google.com/open?id=1bMWw7VYXqFH-m8dBF08dC2Wi0nbOtvDK',
  'Certificate 2 — Name': 'English Language Teaching Certificate',
  'Certificate 2 — Issuing Organization': 'ABC Training Academy',
  'Certificate 2 — Date': '6/12/2023',
  'Certificate 2 — Description': 'Certificate in English language teaching methods and classroom practice.',
  'Certificate 2 — File': 'https://drive.google.com/open?id=1WYPoAOG4ag3ldcyFMkJYt0KYNDHBSqkT',
  'Certificate 3 — Name': 'Functional Safety',
  'Certificate 3 — Issuing Organization': 'safeTTy',
  'Certificate 3 — Date': '9/9/2026',
  'Certificate 3 — Description': 'FuSa Cert in Embedded Systems',
  'Certificate 3 — File': 'https://drive.google.com/open?id=1N3SR9O9I9BTJxxG8BwOKMCnLsRrsoaot',
  'Preferred Profile Theme': 'Emerald',
  'Profile Visibility': 'Public',
  'Publication Consent': 'I confirm that the information, photo, videos, certificates, and contact information I submit may be displayed on my tutor profile according to the visibility setting I select.',
  'Information Accuracy': 'I confirm that the information I have provided is accurate and belongs to me.',
  'Status': 'Approved',
  'Featured': 'Yes',
  'Admin Notes': 'Verified TESOL cert manually — looks good.'
};

// A second, sparse tutor to prove the "hide what's missing" rule end to end:
// only name/title/photo/summary/one specialization/one contact/pending status.
const sarah = {
  'Full Name': 'Sarah Ahmed',
  'Professional Title': 'Conversational English Coach',
  'Profile Photo': 'https://drive.google.com/open?id=1exampleSarahPhotoId000000',
  'Preferred Profile Key': 'sarah-ahmed',
  'Professional Summary': 'I help adult beginners build confidence speaking English in everyday situations, with a friendly, low-pressure approach.',
  'Teaching Specializations': 'Conversational English, English for Non-Native Speakers',
  'Student Age Groups': 'Adults',
  'Student Levels': 'Beginner, Elementary',
  'Teaching Format': 'Online',
  'Professional Email': 'sarah.ahmed.tutor@example.com',
  'Preferred Profile Theme': 'Teal',
  'Profile Visibility': 'Public',
  'Status': 'Pending',
  'Featured': 'No'
};

const rows = [ahmed, sarah].map((obj) => {
  const full = {};
  headers.forEach((h) => { full[h] = obj[h] ?? ''; });
  return full;
});

const csv = stringifyCSV(headers, rows);
const outPath = path.join(__dirname, '..', 'data', 'raw', 'tutors.csv');
fs.writeFileSync(outPath, csv, 'utf8');
console.log('Wrote fixture with', rows.length, 'rows and', headers.length, 'columns to', outPath);
