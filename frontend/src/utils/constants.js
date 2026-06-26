export const CATEGORIES = [
  'Web Development', 'Mobile App', 'Data Science', 'DevOps',
  'Design & Creative', 'Video & Animation', 'Writing & Translation',
  'Sales & Marketing', 'Virtual Assistance', 'Finance & Accounting',
  'Legal & Consulting', 'Other'
];

export const DURATIONS = [
  { value: '<1week', label: 'Less than 1 week' },
  { value: '1-4weeks', label: '1 to 4 weeks' },
  { value: '1-3months', label: '1 to 3 months' },
  { value: '3+months', label: 'More than 3 months' },
];

export const CATEGORY_SKILLS = {
  'Web Development': ['React', 'Node.js', 'MongoDB', 'AWS', 'Docker', 'TypeScript', 'GraphQL', 'REST API', 'Vue.js', 'Angular', 'Next.js', 'Express', 'PostgreSQL', 'MySQL', 'Firebase', 'Tailwind CSS', 'Sass', 'HTML5', 'CSS3', 'PHP', 'Laravel', 'Ruby on Rails', 'Django', 'Flask', 'Spring Boot'],
  'Mobile App': ['Swift', 'Kotlin', 'React Native', 'Flutter', 'Objective-C', 'Java', 'Android SDK', 'iOS SDK', 'Firebase', 'SQLite', 'Mobile UI Design', 'App Store Optimization'],
  'Data Science': ['Python', 'R', 'Machine Learning', 'Data Analysis', 'Pandas', 'NumPy', 'TensorFlow', 'PyTorch', 'SQL', 'Tableau', 'Power BI', 'Hadoop', 'Spark', 'Natural Language Processing', 'Computer Vision'],
  'DevOps': ['AWS', 'Docker', 'Kubernetes', 'CI/CD', 'Jenkins', 'GitLab CI', 'Terraform', 'Ansible', 'Linux', 'Bash Scripting', 'Nginx', 'Apache', 'Azure', 'Google Cloud Platform', 'Monitoring (Prometheus/Grafana)'],
  'Design & Creative': ['UI/UX', 'Figma', 'Graphic Design', 'Logo Design', 'Illustration', 'Photoshop', 'Illustrator', 'Adobe XD', 'Sketch', 'InDesign', 'After Effects', 'Premiere Pro', '3D Modeling', 'Blender', 'Typography', 'Branding'],
  'Video & Animation': ['Video Editing', 'Animation', 'After Effects', 'Premiere Pro', 'Motion Graphics', '2D Animation', '3D Animation', 'Whiteboard Animation', 'Explainer Videos', 'DaVinci Resolve', 'Final Cut Pro'],
  'Writing & Translation': ['Content Writing', 'Copywriting', 'SEO Writing', 'Translation', 'Proofreading', 'Technical Writing', 'Ghostwriting', 'Creative Writing', 'Grant Writing', 'Resume Writing', 'Transcription'],
  'Sales & Marketing': ['Social Media Marketing', 'Email Marketing', 'Lead Generation', 'Sales Strategy', 'SEO', 'SEM', 'Google Ads', 'Facebook Ads', 'Content Marketing', 'Affiliate Marketing', 'Market Research', 'Public Relations'],
  'Virtual Assistance': ['Virtual Assistance', 'Data Entry', 'Web Research', 'Customer Support', 'Email Management', 'Calendar Management', 'Admin Support', 'Microsoft Office', 'Google Workspace'],
  'Finance & Accounting': ['Accounting', 'Bookkeeping', 'Financial Analysis', 'QuickBooks', 'Xero', 'Excel', 'Tax Preparation', 'Payroll', 'Financial Forecasting', 'Business Planning'],
  'Legal & Consulting': ['Legal Consulting', 'Contract Drafting', 'Business Consulting', 'HR Consulting', 'Management Consulting', 'Patents', 'Trademarks', 'Corporate Law', 'Compliance'],
  'Other': ['General']
};

export const SKILLS = [...new Set(Object.values(CATEGORY_SKILLS).flat())].sort();
