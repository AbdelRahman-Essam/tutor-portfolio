'use strict';

// ---------------------------------------------------------------------------
// Static UI string dictionary (EN/AR).
//
// This replaces the old Google Translate widget: instead of translating the
// page in the visitor's browser on every visit, the site is built TWICE —
// once per language — with the real text baked into the HTML. Nothing to
// download from Google, nothing that can mistranslate a name or a Qur'an
// reference, and it works with no internet connection at all.
//
// Per-profile content (bios, specializations, certificates, etc.) is NOT
// here — that lives in data/translations/ar.json, hand-translated per
// profile. This file is only the labels/headings/buttons that are the same
// on every page.
// ---------------------------------------------------------------------------

const UI = {
  en: {
    brand: 'Profile Directory',
    directoryTitle: 'Find a tutor or professional',
    directorySubtitle: 'Browse profiles with videos, certificates, experience and contact details.',
    searchPlaceholder: 'Search by name or title…',
    emptyState: 'No profiles match that search.',
    generated: 'Generated',
    featuredTutor: 'Featured tutor',
    featuredProfessional: 'Featured professional',
    teachingProfile: 'Teaching Profile',
    specializations: 'Specializations',
    ageGroups: 'Age Groups',
    levels: 'Levels',
    format: 'Format',
    videos: 'Videos',
    teachingExperience: 'Teaching Experience',
    ofTeachingExperience: 'of teaching experience.',
    languages: 'Languages',
    technicalSkills: 'Technical Skills',
    teachingPhilosophy: 'Teaching Philosophy',
    certificates: 'Certificates',
    contact: 'Contact',
    viewCertificate: 'View certificate',
    certNotShowing: 'Certificate not showing?',
    openInNewTab: 'Open it in a new tab',
    professionalOverview: 'Professional Overview',
    ofProfessionalExperience: 'of professional experience.',
    areasOfExpertise: 'Areas of Expertise',
    workExperience: 'Work Experience',
    projectsPortfolio: 'Projects & Portfolio',
    educationQualifications: 'Education & Qualifications',
    softwareTools: 'Software & Tools',
    getInTouch: 'Get in touch',
    messageWhatsApp: 'Message on WhatsApp',
    messageTelegram: 'Message on Telegram',
    call: 'Call',
    statYear: 'Year experience',
    statYears: 'Years experience',
    statSpecializations: 'Specializations',
    statAreasExpertise: 'Areas of expertise',
    statLanguage: 'Language',
    statLanguages: 'Languages',
    statCertificate: 'Certificate',
    statCertificates: 'Certificates',
    contactEmail: 'Email',
    contactWhatsApp: 'WhatsApp',
    contactPhone: 'Phone',
    contactTelegram: 'Telegram',
    contactFacebook: 'Facebook',
    contactInstagram: 'Instagram',
    contactLinkedIn: 'LinkedIn',
    contactGitHub: 'GitHub',
    contactWebsite: 'Website',
    footerSuffix: '— Profile Directory',
    editMyProfile: 'Edit my profile',
    profilesCount: (n) => `${n} profile${n === 1 ? '' : 's'}`,
  },
  ar: {
    brand: 'دليل الملفات الشخصية',
    directoryTitle: 'ابحث عن معلّم أو متخصص',
    directorySubtitle: 'تصفّح الملفات الشخصية مع الفيديوهات والشهادات والخبرات وبيانات التواصل.',
    searchPlaceholder: 'ابحث بالاسم أو المسمى الوظيفي…',
    emptyState: 'لا توجد ملفات مطابقة لهذا البحث.',
    generated: 'آخر تحديث',
    featuredTutor: 'معلّم مميّز',
    featuredProfessional: 'متخصص مميّز',
    teachingProfile: 'الملف التعليمي',
    specializations: 'التخصصات',
    ageGroups: 'الفئات العمرية',
    levels: 'المستويات',
    format: 'طريقة التدريس',
    videos: 'الفيديوهات',
    teachingExperience: 'الخبرة التعليمية',
    ofTeachingExperience: 'من الخبرة في التدريس.',
    languages: 'اللغات',
    technicalSkills: 'المهارات التقنية',
    teachingPhilosophy: 'فلسفة التدريس',
    certificates: 'الشهادات',
    contact: 'التواصل',
    viewCertificate: 'عرض الشهادة',
    certNotShowing: 'الشهادة لا تظهر؟',
    openInNewTab: 'افتحها في تبويب جديد',
    professionalOverview: 'نظرة عامة مهنية',
    ofProfessionalExperience: 'من الخبرة المهنية.',
    areasOfExpertise: 'مجالات الخبرة',
    workExperience: 'الخبرة العملية',
    projectsPortfolio: 'المشاريع والأعمال السابقة',
    educationQualifications: 'التعليم والمؤهلات',
    softwareTools: 'البرمجيات والأدوات',
    getInTouch: 'تواصل معي',
    messageWhatsApp: 'راسلني عبر واتساب',
    messageTelegram: 'راسلني عبر تيليجرام',
    call: 'اتصال',
    statYear: 'سنة خبرة',
    statYears: 'سنوات خبرة',
    statSpecializations: 'تخصصات',
    statAreasExpertise: 'مجالات خبرة',
    statLanguage: 'لغة',
    statLanguages: 'لغات',
    statCertificate: 'شهادة',
    statCertificates: 'شهادات',
    contactEmail: 'البريد الإلكتروني',
    contactWhatsApp: 'واتساب',
    contactPhone: 'الهاتف',
    contactTelegram: 'تيليجرام',
    contactFacebook: 'فيسبوك',
    contactInstagram: 'إنستغرام',
    contactLinkedIn: 'لينكدإن',
    contactGitHub: 'جيثب',
    contactWebsite: 'الموقع الإلكتروني',
    footerSuffix: '— دليل الملفات الشخصية',
    editMyProfile: 'تعديل ملفي الشخصي',
    profilesCount: (n) => (n === 1 ? 'ملف شخصي واحد' : `${n} ملفات شخصية`),
  },
};

function S(lang, key, ...args) {
  const dict = UI[lang] || UI.en;
  const val = key in dict ? dict[key] : UI.en[key];
  return typeof val === 'function' ? val(...args) : val;
}

module.exports = { S, UI };
