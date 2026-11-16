import {
  AcademicYearConfig,
  ClassSettings,
  ConductRating,
  ConductRatingThresholds,
  ConductRecord,
  SemesterKey,
} from '../types';

export const SEMESTER_BASE_SCORE = 200;

export const DEFAULT_ACADEMIC_YEARS_CONFIG: AcademicYearConfig[] = [
  {
    academicYear: '2026 - 2027',
    hk1Start: '2026-09-01',
    hk1End: '2027-01-15',
    hk2Start: '2027-01-16',
    hk2End: '2027-05-31',
  },
  {
    academicYear: '2027 - 2028',
    hk1Start: '2027-09-01',
    hk1End: '2028-01-15',
    hk2Start: '2028-01-16',
    hk2End: '2028-05-31',
  },
];

/**
 * Chuẩn hóa chuỗi năm học về dạng "YYYY - YYYY" để so sánh chính xác
 * (hỗ trợ cả dấu "-" và "–", có hoặc không có khoảng trắng)
 */
export function normalizeAcademicYear(ay?: string): string {
  if (!ay) return '2026 - 2027';
  const match = ay.match(/(\d{4})\s*[-–—]\s*(\d{4})/);
  if (match) {
    return `${match[1]} - ${match[2]}`;
  }
  return ay.trim();
}

/**
 * Lấy ngày hiện tại theo múi giờ Việt Nam (UTC+7) dạng YYYY-MM-DD
 */
export function getTodayVNDateString(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const vn = new Date(utc + 3600000 * 7);
  const y = vn.getFullYear();
  const m = String(vn.getMonth() + 1).padStart(2, '0');
  const d = String(vn.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Lấy danh sách cấu hình năm học từ settings (luôn đảm bảo có cấu hình hợp lệ)
 */
export function getAcademicYearsConfig(settings?: ClassSettings): AcademicYearConfig[] {
  const configured = Array.isArray(settings?.academicYearsConfig)
    ? settings!.academicYearsConfig
    : [];

  if (configured.length === 0) {
    // Nếu năm học hiện tại trong settings chưa nằm trong mặc định, tự động tạo cấu hình mặc định cho năm đó
    const activeYear = normalizeAcademicYear(settings?.academicYear);
    const hasActiveInDefault = DEFAULT_ACADEMIC_YEARS_CONFIG.some(
      (c) => normalizeAcademicYear(c.academicYear) === activeYear
    );
    if (hasActiveInDefault) {
      return DEFAULT_ACADEMIC_YEARS_CONFIG.map((c) => ({ ...c }));
    }
    const yearMatch = activeYear.match(/^(\d{4})\s*-\s*(\d{4})$/);
    if (yearMatch) {
      const y1 = Number(yearMatch[1]);
      const y2 = Number(yearMatch[2]);
      return [
        {
          academicYear: activeYear,
          hk1Start: `${y1}-09-01`,
          hk1End: `${y2}-01-15`,
          hk2Start: `${y2}-01-16`,
          hk2End: `${y2}-05-31`,
        },
        ...DEFAULT_ACADEMIC_YEARS_CONFIG.map((c) => ({ ...c })),
      ];
    }
    return DEFAULT_ACADEMIC_YEARS_CONFIG.map((c) => ({ ...c }));
  }

  return configured.map((c) => ({
    ...c,
    academicYear: normalizeAcademicYear(c.academicYear),
  }));
}

/**
 * Tạo cấu hình năm học mặc định từ chuỗi năm học "YYYY - YYYY"
 */
export function buildDefaultAcademicYearConfig(academicYear: string): AcademicYearConfig {
  const normalized = normalizeAcademicYear(academicYear);
  const match = normalized.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (match) {
    const y1 = Number(match[1]);
    const y2 = Number(match[2]);
    return {
      academicYear: normalized,
      hk1Start: `${y1}-09-01`,
      hk1End: `${y2}-01-15`,
      hk2Start: `${y2}-01-16`,
      hk2End: `${y2}-05-31`,
    };
  }
  return {
    academicYear: normalized,
    hk1Start: '2026-09-01',
    hk1End: '2027-01-15',
    hk2Start: '2027-01-16',
    hk2End: '2027-05-31',
  };
}

export interface TermDetectionResult {
  matched: boolean;
  academicYear: string;
  semester: SemesterKey;
}

/**
 * Xác định năm học và học kỳ dựa trên ngày xảy ra sự việc và cấu hình lịch học kỳ
 */
export function detectTermByDate(
  dateStr: string,
  configs: AcademicYearConfig[],
  fallbackAcademicYear: string = '2026 - 2027'
): TermDetectionResult {
  if (dateStr) {
    for (const cfg of configs) {
      if (cfg.hk1Start && cfg.hk1End && dateStr >= cfg.hk1Start && dateStr <= cfg.hk1End) {
        return {
          matched: true,
          academicYear: normalizeAcademicYear(cfg.academicYear),
          semester: 'HK1',
        };
      }
      if (cfg.hk2Start && cfg.hk2End && dateStr >= cfg.hk2Start && dateStr <= cfg.hk2End) {
        return {
          matched: true,
          academicYear: normalizeAcademicYear(cfg.academicYear),
          semester: 'HK2',
        };
      }
    }
  }

  // Fallback suy luận gần nhất khi ngày nằm ngoài các khoảng cấu hình
  const fallbackNorm = normalizeAcademicYear(fallbackAcademicYear);
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [yStr, mStr] = dateStr.split('-');
    const y = Number(yStr);
    const m = Number(mStr);

    // Kiểm tra xem có năm học nào khớp năm dương lịch không
    for (const cfg of configs) {
      const match = normalizeAcademicYear(cfg.academicYear).match(/^(\d{4})\s*-\s*(\d{4})$/);
      if (match) {
        const y1 = Number(match[1]);
        const y2 = Number(match[2]);
        if (y === y1 && m >= 7) {
          return { matched: false, academicYear: cfg.academicYear, semester: 'HK1' };
        }
        if (y === y2 && m <= 6) {
          return {
            matched: false,
            academicYear: cfg.academicYear,
            semester: cfg.hk1End && dateStr <= cfg.hk1End ? 'HK1' : 'HK2',
          };
        }
      }
    }

    if (m >= 8) {
      return { matched: false, academicYear: `${y} - ${y + 1}`, semester: 'HK1' };
    }
    return { matched: false, academicYear: `${y - 1} - ${y}`, semester: 'HK2' };
  }

  return {
    matched: false,
    academicYear: fallbackNorm,
    semester: 'HK1',
  };
}

/**
 * Xác định học kỳ đang diễn ra dựa trên ngày hiện tại (múi giờ Việt Nam) và cấu hình học kỳ.
 */
export function getActiveTerm(
  settings?: ClassSettings,
  referenceDateStr: string = getTodayVNDateString()
): { academicYear: string; semester: SemesterKey; isMatchedByDate: boolean } {
  const configs = getAcademicYearsConfig(settings);
  const fallbackYear = normalizeAcademicYear(settings?.academicYear);

  const detected = detectTermByDate(referenceDateStr, configs, fallbackYear);
  if (detected.matched) {
    return {
      academicYear: detected.academicYear,
      semester: detected.semester,
      isMatchedByDate: true,
    };
  }

  // Nếu ngày hiện tại nằm ngoài mọi khoảng học kỳ (VD: nghỉ hè hoặc ngày chuyển tiếp),
  // ưu tiên kiểm tra cấu hình học kỳ trong settings hoặc khoảng học kỳ gần nhất đã qua
  const fallbackSemester: SemesterKey =
    settings?.semester === 'Học kỳ II' || settings?.semester === 'HK2' ? 'HK2' : 'HK1';

  return {
    academicYear: fallbackYear,
    semester: fallbackSemester,
    isMatchedByDate: false,
  };
}

/**
 * Lấy (academicYear, semester) chính xác của một bản ghi sự việc
 */
export function resolveRecordTerm(
  record: ConductRecord,
  configs: AcademicYearConfig[],
  fallbackYear: string = '2026 - 2027'
): { academicYear: string; semester: SemesterKey } {
  if (record.academicYear && (record.semester === 'HK1' || record.semester === 'HK2')) {
    return {
      academicYear: normalizeAcademicYear(record.academicYear),
      semester: record.semester,
    };
  }
  const detected = detectTermByDate(record.date, configs, fallbackYear);
  return {
    academicYear: record.academicYear ? normalizeAcademicYear(record.academicYear) : detected.academicYear,
    semester:
      record.semester === 'HK1' || record.semester === 'HK2'
        ? record.semester
        : detected.semester,
  };
}

/**
 * Lấy danh sách toàn bộ năm học từ cấu hình và dữ liệu lịch sử (đã sắp xếp tăng dần)
 */
export function getAllAcademicYears(
  settings?: ClassSettings,
  conduct: ConductRecord[] = []
): string[] {
  const configs = getAcademicYearsConfig(settings);
  const set = new Set<string>();

  if (settings?.academicYear) {
    set.add(normalizeAcademicYear(settings.academicYear));
  }
  configs.forEach((c) => set.add(normalizeAcademicYear(c.academicYear)));

  const safeConduct = Array.isArray(conduct) ? conduct : [];
  for (const rec of safeConduct) {
    if (!rec) continue;
    const term = resolveRecordTerm(rec, configs, normalizeAcademicYear(settings?.academicYear));
    set.add(term.academicYear);
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function getSemesterLabel(semester: SemesterKey): string {
  return semester === 'HK1' ? 'Học kỳ I' : 'Học kỳ II';
}

/**
 * Quy tắc xếp loại hạnh kiểm hiện có của ứng dụng
 */
export function calculateConductRating(
  score: number,
  ratingThresholds?: ConductRatingThresholds
): {
  rating: ConductRating;
  color: string;
  badgeBg: string;
  badgeText: string;
  desc: string;
} {
  const totMin = ratingThresholds?.year?.totMin ?? 90;
  const khaMin = ratingThresholds?.year?.khaMin ?? 75;
  const datMin = ratingThresholds?.year?.datMin ?? 50;

  if (score >= totMin) {
    return {
      rating: 'Tốt',
      color: 'emerald',
      badgeBg: 'bg-emerald-100 border-emerald-300',
      badgeText: 'text-emerald-800',
      desc: 'Rèn luyện xuất sắc, gương mẫu chấp hành tốt nội quy lớp và nhà trường.',
    };
  }
  if (score >= khaMin) {
    return {
      rating: 'Khá',
      color: 'blue',
      badgeBg: 'bg-blue-100 border-blue-300',
      badgeText: 'text-blue-800',
      desc: 'Ý thức nề nếp tốt, hoàn thành các nhiệm vụ được giao.',
    };
  }
  if (score >= datMin) {
    return {
      rating: 'Đạt',
      color: 'amber',
      badgeBg: 'bg-amber-100 border-amber-300',
      badgeText: 'text-amber-800',
      desc: 'Cần nâng cao ý thức rèn luyện, còn vi phạm một số nội quy nề nếp.',
    };
  }
  return {
    rating: 'Chưa đạt',
    color: 'rose',
    badgeBg: 'bg-rose-100 border-rose-300',
    badgeText: 'text-rose-800',
    desc: 'Vi phạm nhiều lần nề nếp kỷ luật, cần giáo viên và gia đình phối hợp theo dõi.',
  };
}

export interface StudentSemesterConductResult {
  baseScore: number; // Luôn là 200 cho mỗi học kỳ
  praisePoints: number; // Tổng điểm thưởng trong học kỳ (số dương)
  reminderPoints: number; // Tổng điểm trừ trong học kỳ (số dương)
  totalScore: number; // 200 + praisePoints - reminderPoints
  praiseCount: number;
  reminderCount: number;
  records: ConductRecord[];
  ratingInfo: ReturnType<typeof calculateConductRating>;
}

/**
 * Tính điểm thi đua độc lập của 1 học sinh trong một (năm học, học kỳ) cụ thể.
 * Công thức: Điểm thi đua học kỳ = 200 + Tổng điểm thưởng trong học kỳ - Tổng điểm trừ trong học kỳ.
 */
export function computeStudentSemesterConduct(
  studentId: string,
  conduct: ConductRecord[],
  academicYear: string,
  semester: SemesterKey,
  configs: AcademicYearConfig[],
  ratingThresholds?: ConductRatingThresholds
): StudentSemesterConductResult {
  const targetYear = normalizeAcademicYear(academicYear);
  const seenIds = new Set<string>();
  const records: ConductRecord[] = [];

  const safeConduct = Array.isArray(conduct) ? conduct : [];
  for (const rec of safeConduct) {
    if (!rec || rec.studentId !== studentId) continue;
    if (seenIds.has(rec.id)) continue;
    seenIds.add(rec.id);

    const term = resolveRecordTerm(rec, configs, targetYear);
    if (term.academicYear === targetYear && term.semester === semester) {
      records.push(rec);
    }
  }

  let praisePoints = 0;
  let reminderPoints = 0;
  let praiseCount = 0;
  let reminderCount = 0;

  for (const r of records) {
    const pts = Number(r.points) || 0;
    if (r.type === 'praise' || pts > 0) {
      praisePoints += Math.abs(pts);
      praiseCount += 1;
    } else if (r.type === 'reminder' || pts < 0) {
      reminderPoints += Math.abs(pts);
      reminderCount += 1;
    }
  }

  const totalScore = SEMESTER_BASE_SCORE + praisePoints - reminderPoints;
  const ratingInfo = calculateConductRating(totalScore, ratingThresholds);

  return {
    baseScore: SEMESTER_BASE_SCORE,
    praisePoints,
    reminderPoints,
    totalScore,
    praiseCount,
    reminderCount,
    records,
    ratingInfo,
  };
}

/**
 * Lọc danh sách bản ghi thi đua theo Năm học và Học kỳ ('HK1' | 'HK2' | 'ALL')
 * Đảm bảo loại trùng lặp ID.
 */
export function filterConductByTerm(
  conduct: ConductRecord[],
  academicYear: string,
  semesterFilter: SemesterKey | 'ALL',
  configs: AcademicYearConfig[]
): ConductRecord[] {
  const targetYear = normalizeAcademicYear(academicYear);
  const seenIds = new Set<string>();
  const result: ConductRecord[] = [];

  const safeConduct = Array.isArray(conduct) ? conduct : [];
  for (const rec of safeConduct) {
    if (!rec || !rec.studentId) continue;
    if (seenIds.has(rec.id)) continue;
    seenIds.add(rec.id);

    const term = resolveRecordTerm(rec, configs, targetYear);
    if (term.academicYear !== targetYear) continue;
    if (semesterFilter !== 'ALL' && term.semester !== semesterFilter) continue;

    result.push({
      ...rec,
      academicYear: term.academicYear,
      semester: term.semester,
    });
  }

  return result;
}
