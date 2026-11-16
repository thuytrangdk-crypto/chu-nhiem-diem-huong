import * as XLSX from 'xlsx';
import {
  AcademicYearConfig,
  ClassSettings,
  ConductRatingThresholds,
  ConductRecord,
  SemesterKey,
  Student,
} from '../types';
import { formatDateVN } from './storage';
import {
  SEMESTER_BASE_SCORE,
  calculateConductRating,
  computeStudentSemesterConduct,
  filterConductByTerm,
  getAcademicYearsConfig,
  getSemesterLabel,
  normalizeAcademicYear,
  resolveRecordTerm,
} from './conductHelpers';

export interface ConductExcelExportParams {
  students: Student[];
  conduct: ConductRecord[];
  settings: ClassSettings;
  classNameTitle: string;
  periodLabel: string;
  startDateStr: string; // YYYY-MM-DD
  endDateStr: string;   // YYYY-MM-DD
  exportTimestamp: string;
  academicYear?: string;
  semesterFilter?: SemesterKey | 'ALL'; // 'HK1' | 'HK2' | 'ALL' khi xuất theo học kỳ/cả năm
  exportMode?: 'period' | 'semester' | 'full_year';
  skipFileWrite?: boolean;
}

export interface StudentConductSummary {
  student: Student;
  baseScore: number;
  praisePoints: number;
  reminderPoints: number; // Số dương
  totalScore: number;
  ratingText: string;
  rank: number;
  praiseCount: number;
  reminderCount: number;
  note: string;
}

export interface StudentFullYearConductSummary {
  student: Student;
  hk1: {
    baseScore: number;
    praisePoints: number;
    reminderPoints: number;
    totalScore: number;
    ratingText: string;
    praiseCount: number;
    reminderCount: number;
  };
  hk2: {
    baseScore: number;
    praisePoints: number;
    reminderPoints: number;
    totalScore: number;
    ratingText: string;
    praiseCount: number;
    reminderCount: number;
  };
  totalPraiseCount: number;
  totalReminderCount: number;
  note: string;
}

/**
 * Ngăn chặn lỗi Excel Formula Injection (CSV/Excel Formula Execution)
 */
export function sanitizeExcelText(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Lấy thời gian hiện tại theo múi giờ Việt Nam (UTC+7)
 */
export function getVietnamNow(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 3600000 * 7);
}

export function toDateStringVN(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Tính toán tổng hợp thi đua cho 1 kỳ (hoặc 1 học kỳ HK1/HK2 độc lập với nền 200 điểm)
 */
export function computeConductSummary(
  students: Student[],
  conduct: ConductRecord[],
  startDateStr: string,
  endDateStr: string,
  ratingThresholds?: ConductRatingThresholds,
  options?: {
    academicYear?: string;
    semester?: SemesterKey;
    yearConfigs?: AcademicYearConfig[];
  }
): {
  summaries: StudentConductSummary[];
  periodRecords: ConductRecord[];
} {
  if (!Array.isArray(students) || students.length === 0) {
    throw new Error('Chưa có dữ liệu học sinh của lớp đang chọn. Không thể xuất file!');
  }

  const studentIdSet = new Set(students.map((s) => s.id));
  const seenIds = new Set<string>();
  const periodRecords: ConductRecord[] = [];
  const safeConduct = Array.isArray(conduct) ? conduct : [];
  const yearConfigs = options?.yearConfigs || getAcademicYearsConfig(undefined);

  for (const record of safeConduct) {
    if (!record || !record.date || !record.studentId) continue;
    if (!studentIdSet.has(record.studentId)) continue;
    if (seenIds.has(record.id)) continue;
    seenIds.add(record.id);

    if (options?.academicYear && options?.semester) {
      const term = resolveRecordTerm(record, yearConfigs, options.academicYear);
      if (
        term.academicYear === normalizeAcademicYear(options.academicYear) &&
        term.semester === options.semester
      ) {
        periodRecords.push({
          ...record,
          academicYear: term.academicYear,
          semester: term.semester,
        });
      }
    } else if (record.date >= startDateStr && record.date <= endDateStr) {
      const term = resolveRecordTerm(record, yearConfigs, options?.academicYear);
      periodRecords.push({
        ...record,
        academicYear: term.academicYear,
        semester: term.semester,
      });
    }
  }

  periodRecords.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const baseScore = SEMESTER_BASE_SCORE; // 200 điểm nền mỗi học kỳ

  const rawSummaries = students.map((student) => {
    const studentRecords = periodRecords.filter((r) => r.studentId === student.id);
    const praises = studentRecords.filter((r) => r.type === 'praise' || (r.points || 0) > 0);
    const reminders = studentRecords.filter((r) => r.type === 'reminder' || (r.points || 0) < 0);

    const praisePoints = praises.reduce((sum, r) => sum + Math.abs(r.points || 0), 0);
    const reminderPoints = reminders.reduce((sum, r) => sum + Math.abs(r.points || 0), 0);

    const totalScore = baseScore + praisePoints - reminderPoints;
    const ratingInfo = calculateConductRating(totalScore, ratingThresholds);

    return {
      student,
      baseScore,
      praisePoints,
      reminderPoints,
      totalScore,
      ratingText: ratingInfo.rating,
      rank: 1,
      praiseCount: praises.length,
      reminderCount: reminders.length,
      note: student.note || '',
    };
  });

  const sortedSummaries = [...rawSummaries].sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    return a.student.name.localeCompare(b.student.name, 'vi');
  });

  for (let i = 0; i < sortedSummaries.length; i++) {
    if (i > 0 && sortedSummaries[i].totalScore === sortedSummaries[i - 1].totalScore) {
      sortedSummaries[i].rank = sortedSummaries[i - 1].rank;
    } else {
      sortedSummaries[i].rank = i + 1;
    }
  }

  return {
    summaries: sortedSummaries,
    periodRecords,
  };
}

/**
 * Tính toán báo cáo CẢ NĂM HỌC với 2 học kỳ độc lập (HK I: 200đ, HK II: 200đ — không cộng 400)
 */
export function computeFullYearConductSummary(
  students: Student[],
  conduct: ConductRecord[],
  academicYear: string,
  configs: AcademicYearConfig[],
  ratingThresholds?: ConductRatingThresholds
): {
  summaries: StudentFullYearConductSummary[];
  yearRecords: ConductRecord[];
} {
  if (!Array.isArray(students) || students.length === 0) {
    throw new Error('Chưa có dữ liệu học sinh của lớp đang chọn. Không thể xuất file!');
  }

  const targetYear = normalizeAcademicYear(academicYear);
  const studentIdSet = new Set(students.map((s) => s.id));
  const yearRecords = filterConductByTerm(
    conduct.filter((r) => studentIdSet.has(r.studentId)),
    targetYear,
    'ALL',
    configs
  ).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const summaries: StudentFullYearConductSummary[] = students.map((student) => {
    const hk1 = computeStudentSemesterConduct(
      student.id,
      conduct,
      targetYear,
      'HK1',
      configs,
      ratingThresholds
    );
    const hk2 = computeStudentSemesterConduct(
      student.id,
      conduct,
      targetYear,
      'HK2',
      configs,
      ratingThresholds
    );

    return {
      student,
      hk1: {
        baseScore: hk1.baseScore,
        praisePoints: hk1.praisePoints,
        reminderPoints: hk1.reminderPoints,
        totalScore: hk1.totalScore,
        ratingText: hk1.ratingInfo.rating,
        praiseCount: hk1.praiseCount,
        reminderCount: hk1.reminderCount,
      },
      hk2: {
        baseScore: hk2.baseScore,
        praisePoints: hk2.praisePoints,
        reminderPoints: hk2.reminderPoints,
        totalScore: hk2.totalScore,
        ratingText: hk2.ratingInfo.rating,
        praiseCount: hk2.praiseCount,
        reminderCount: hk2.reminderCount,
      },
      totalPraiseCount: hk1.praiseCount + hk2.praiseCount,
      totalReminderCount: hk1.reminderCount + hk2.reminderCount,
      note: student.note || '',
    };
  });

  summaries.sort((a, b) => a.student.name.localeCompare(b.student.name, 'vi'));

  return {
    summaries,
    yearRecords,
  };
}

function buildDetailSheet(
  records: ConductRecord[],
  students: Student[],
  configs: AcademicYearConfig[],
  schoolName: string,
  className: string,
  teacherName: string,
  academicYear: string,
  periodLabel: string,
  startDateStr: string,
  endDateStr: string,
  exportTimestamp: string
): XLSX.WorkSheet {
  const sheet2Data: unknown[][] = [
    [`TRƯỜNG: ${schoolName.toUpperCase()}`],
    ['BẢNG CHI TIẾT GHI NHẬN THI ĐUA - NỀ NẾP HỌC SINH'],
    [`Lớp: ${className}   |   Giáo viên chủ nhiệm: ${teacherName}   |   Năm học: ${academicYear}`],
    [
      `Kỳ báo cáo: ${periodLabel} (Từ ngày ${formatDateVN(startDateStr)} đến ngày ${formatDateVN(
        endDateStr
      )})   |   Thời gian xuất: ${exportTimestamp}`,
    ],
    [],
    [
      'STT',
      'Thời gian',
      'Năm học',
      'Học kỳ',
      'Mã hồ sơ học sinh',
      'Họ và tên',
      'Nội dung sự việc',
      'Loại ghi nhận',
      'Điểm cộng/trừ',
      'Người ghi nhận',
      'Ghi chú',
    ],
  ];

  if (records.length === 0) {
    sheet2Data.push([
      1,
      formatDateVN(startDateStr),
      academicYear,
      '-',
      '-',
      'Toàn lớp',
      'Không có lượt ghi nhận sự việc nào trong kỳ báo cáo này',
      '-',
      0,
      teacherName,
      'Không có vi phạm hoặc tuyên dương phát sinh',
    ]);
  } else {
    records.forEach((rec, idx) => {
      const student = students.find((s) => s.id === rec.studentId);
      const term = resolveRecordTerm(rec, configs, academicYear);
      const studentCode = student?.code || '-';
      const studentName = student?.name || 'Học sinh';
      const eventName = sanitizeExcelText(rec.criterionName || 'Ghi nhận sự việc');
      const eventType = rec.type === 'praise' || (rec.points || 0) > 0 ? 'Tích cực' : 'Vi phạm';
      const pointsNum = Number(rec.points) || 0;
      const recorder = sanitizeExcelText(
        (rec as ConductRecord & { recordedBy?: string }).recordedBy || teacherName || 'GVCN'
      );
      const note = sanitizeExcelText(rec.note || '');

      sheet2Data.push([
        idx + 1,
        formatDateVN(rec.date),
        term.academicYear,
        getSemesterLabel(term.semester),
        studentCode,
        sanitizeExcelText(studentName),
        eventName,
        eventType,
        pointsNum,
        recorder,
        note,
      ]);
    });
  }

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  const sheet2HeaderRowIndex = 5;
  const range2 = XLSX.utils.decode_range(ws2['!ref'] || 'A1:K6');

  for (let R = sheet2HeaderRowIndex + 1; R <= range2.e.r; ++R) {
    // Cột E (col 4): Mã hồ sơ học sinh -> text 's'
    const cellCode = ws2[XLSX.utils.encode_cell({ r: R, c: 4 })];
    if (cellCode) {
      cellCode.t = 's';
      cellCode.z = '@';
    }
    // Cột A (STT) & Cột I (Điểm cộng/trừ, col 8) -> number 'n'
    [0, 8].forEach((cIdx) => {
      const cell = ws2[XLSX.utils.encode_cell({ r: R, c: cIdx })];
      if (cell && typeof cell.v === 'number') {
        cell.t = 'n';
      }
    });
  }

  ws2['!cols'] = [
    { wch: 6 },  // STT
    { wch: 13 }, // Thời gian
    { wch: 14 }, // Năm học
    { wch: 12 }, // Học kỳ
    { wch: 18 }, // Mã hồ sơ
    { wch: 24 }, // Họ và tên
    { wch: 36 }, // Nội dung sự việc
    { wch: 14 }, // Loại ghi nhận
    { wch: 15 }, // Điểm cộng/trừ
    { wch: 24 }, // Người ghi nhận
    { wch: 30 }, // Ghi chú
  ];

  ws2['!autofilter'] = {
    ref: `A6:K${range2.e.r + 1}`,
  };
  ws2['!freeze'] = {
    xSplit: 0,
    ySplit: 6,
    topLeftCell: 'A7',
    activePane: 'bottomLeft',
    state: 'frozen',
  };
  ws2['!views'] = [
    {
      state: 'frozen',
      ySplit: 6,
      activePane: 'bottomLeft',
      topLeftCell: 'A7',
    },
  ];

  return ws2;
}

/**
 * Xuất file Excel thi đua (.xlsx) gồm 2 sheet: "Tổng hợp thi đua" và "Chi tiết ghi nhận"
 */
export function exportConductToExcel(params: ConductExcelExportParams) {
  const {
    students,
    conduct,
    settings,
    classNameTitle,
    periodLabel,
    startDateStr,
    endDateStr,
    exportTimestamp,
    academicYear: paramAcademicYear,
    semesterFilter,
    exportMode,
    skipFileWrite = false,
  } = params;

  if (!students || students.length === 0) {
    throw new Error('Dữ liệu danh sách học sinh rỗng. Vui lòng kiểm tra lại lớp đang chọn!');
  }

  const schoolName = settings.schoolName || 'THCS Nguyễn Huệ - Phường Phú Thọ Hòa';
  const className = classNameTitle || settings.className || 'Lớp 9A5';
  const teacherName = settings.teacherName || 'Nguyễn Thị Diểm Hương';
  const yearConfigs = getAcademicYearsConfig(settings);
  const academicYear = normalizeAcademicYear(paramAcademicYear || settings.academicYear || '2026 - 2027');
  const isFullYearMode = exportMode === 'full_year' || semesterFilter === 'ALL';

  const workbook = XLSX.utils.book_new();
  let totalStudents = 0;
  let totalRecords = 0;

  if (isFullYearMode) {
    const { summaries, yearRecords } = computeFullYearConductSummary(
      students,
      conduct,
      academicYear,
      yearConfigs,
      settings.ratingThresholds
    );

    totalStudents = summaries.length;
    totalRecords = yearRecords.length;

    const sheet1Data: unknown[][] = [
      [`TRƯỜNG: ${schoolName.toUpperCase()}`],
      [`BẢNG TỔNG HỢP THI ĐUA CẢ NĂM HỌC ${academicYear} (TÁCH ĐỘC LẬP HỌC KỲ I & HỌC KỲ II)`],
      [`Lớp: ${className}   |   Giáo viên chủ nhiệm: ${teacherName}   |   Năm học: ${academicYear}`],
      [
        `Kỳ báo cáo: ${periodLabel} (Từ ${formatDateVN(startDateStr)} đến ${formatDateVN(
          endDateStr
        )})   |   Thời gian xuất: ${exportTimestamp}`,
      ],
      [],
      [
        'STT',
        'Mã hồ sơ học sinh',
        'Họ và tên',
        'Lớp',
        'Điểm nền HK I',
        'Tổng điểm thưởng HK I',
        'Tổng điểm trừ HK I',
        'Điểm thi đua HK I',
        'Hạnh kiểm HK I',
        'Điểm nền HK II',
        'Tổng điểm thưởng HK II',
        'Tổng điểm trừ HK II',
        'Điểm thi đua HK II',
        'Hạnh kiểm HK II',
        'Tổng lượt tích cực',
        'Tổng lượt vi phạm',
        'Ghi chú',
      ],
    ];

    summaries.forEach((item, idx) => {
      sheet1Data.push([
        idx + 1,
        item.student.code,
        sanitizeExcelText(item.student.name),
        className,
        item.hk1.baseScore,
        item.hk1.praisePoints,
        item.hk1.reminderPoints,
        item.hk1.totalScore,
        item.hk1.ratingText,
        item.hk2.baseScore,
        item.hk2.praisePoints,
        item.hk2.reminderPoints,
        item.hk2.totalScore,
        item.hk2.ratingText,
        item.totalPraiseCount,
        item.totalReminderCount,
        sanitizeExcelText(item.note),
      ]);
    });

    const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
    const range1 = XLSX.utils.decode_range(ws1['!ref'] || 'A1:Q6');

    for (let R = 6; R <= range1.e.r; ++R) {
      const cellCode = ws1[XLSX.utils.encode_cell({ r: R, c: 1 })];
      if (cellCode) {
        cellCode.t = 's';
        cellCode.z = '@';
      }
      [0, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15].forEach((colIdx) => {
        const cell = ws1[XLSX.utils.encode_cell({ r: R, c: colIdx })];
        if (cell && typeof cell.v === 'number') {
          cell.t = 'n';
        }
      });
    }

    ws1['!cols'] = [
      { wch: 6 },  // STT
      { wch: 18 }, // Mã hồ sơ
      { wch: 24 }, // Họ và tên
      { wch: 11 }, // Lớp
      { wch: 14 }, // Nền HK1
      { wch: 20 }, // Thưởng HK1
      { wch: 18 }, // Trừ HK1
      { wch: 17 }, // Điểm HK1
      { wch: 15 }, // Hạnh kiểm HK1
      { wch: 14 }, // Nền HK2
      { wch: 20 }, // Thưởng HK2
      { wch: 18 }, // Trừ HK2
      { wch: 17 }, // Điểm HK2
      { wch: 15 }, // Hạnh kiểm HK2
      { wch: 18 }, // Lượt tích cực
      { wch: 18 }, // Lượt vi phạm
      { wch: 28 }, // Ghi chú
    ];

    ws1['!autofilter'] = {
      ref: `A6:Q${range1.e.r + 1}`,
    };
    ws1['!freeze'] = {
      xSplit: 0,
      ySplit: 6,
      topLeftCell: 'A7',
      activePane: 'bottomLeft',
      state: 'frozen',
    };
    ws1['!views'] = [
      {
        state: 'frozen',
        ySplit: 6,
        activePane: 'bottomLeft',
        topLeftCell: 'A7',
      },
    ];

    const ws2 = buildDetailSheet(
      yearRecords,
      students,
      yearConfigs,
      schoolName,
      className,
      teacherName,
      academicYear,
      periodLabel,
      startDateStr,
      endDateStr,
      exportTimestamp
    );

    XLSX.utils.book_append_sheet(workbook, ws1, 'Tổng hợp thi đua');
    XLSX.utils.book_append_sheet(workbook, ws2, 'Chi tiết ghi nhận');
  } else {
    const semesterOption =
      semesterFilter === 'HK1' || semesterFilter === 'HK2'
        ? { academicYear, semester: semesterFilter, yearConfigs }
        : { yearConfigs };

    const { summaries, periodRecords } = computeConductSummary(
      students,
      conduct,
      startDateStr,
      endDateStr,
      settings.ratingThresholds,
      semesterOption
    );

    totalStudents = summaries.length;
    totalRecords = periodRecords.length;

    const sheet1Data: unknown[][] = [
      [`TRƯỜNG: ${schoolName.toUpperCase()}`],
      ['BẢNG TỔNG HỢP THI ĐUA - NỀ NẾP HỌC SINH'],
      [`Lớp: ${className}   |   Giáo viên chủ nhiệm: ${teacherName}   |   Năm học: ${academicYear}`],
      [
        `Kỳ báo cáo: ${periodLabel} (Từ ngày ${formatDateVN(startDateStr)} đến ngày ${formatDateVN(
          endDateStr
        )})   |   Thời gian xuất: ${exportTimestamp}`,
      ],
      [],
      [
        'STT',
        'Mã hồ sơ học sinh',
        'Họ và tên',
        'Lớp',
        'Điểm ban đầu',
        'Tổng điểm cộng',
        'Tổng điểm trừ',
        'Tổng điểm thi đua',
        'Xếp loại thi đua',
        'Xếp hạng',
        'Số lượt ghi nhận tích cực',
        'Số lượt ghi nhận vi phạm',
        'Ghi chú',
      ],
    ];

    summaries.forEach((item, idx) => {
      sheet1Data.push([
        idx + 1,
        item.student.code,
        sanitizeExcelText(item.student.name),
        className,
        item.baseScore,
        item.praisePoints,
        item.reminderPoints,
        item.totalScore,
        item.ratingText,
        item.rank,
        item.praiseCount,
        item.reminderCount,
        sanitizeExcelText(item.note),
      ]);
    });

    const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
    const range1 = XLSX.utils.decode_range(ws1['!ref'] || 'A1:M6');

    for (let R = 6; R <= range1.e.r; ++R) {
      const cellB = ws1[XLSX.utils.encode_cell({ r: R, c: 1 })];
      if (cellB) {
        cellB.t = 's';
        cellB.z = '@';
      }
      [0, 4, 5, 6, 7, 9, 10, 11].forEach((colIdx) => {
        const cell = ws1[XLSX.utils.encode_cell({ r: R, c: colIdx })];
        if (cell && typeof cell.v === 'number') {
          cell.t = 'n';
        }
      });
    }

    ws1['!cols'] = [
      { wch: 6 },
      { wch: 18 },
      { wch: 25 },
      { wch: 12 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 18 },
      { wch: 18 },
      { wch: 12 },
      { wch: 24 },
      { wch: 24 },
      { wch: 32 },
    ];

    ws1['!autofilter'] = {
      ref: `A6:M${range1.e.r + 1}`,
    };
    ws1['!freeze'] = {
      xSplit: 0,
      ySplit: 6,
      topLeftCell: 'A7',
      activePane: 'bottomLeft',
      state: 'frozen',
    };
    ws1['!views'] = [
      {
        state: 'frozen',
        ySplit: 6,
        activePane: 'bottomLeft',
        topLeftCell: 'A7',
      },
    ];

    const ws2 = buildDetailSheet(
      periodRecords,
      students,
      yearConfigs,
      schoolName,
      className,
      teacherName,
      academicYear,
      periodLabel,
      startDateStr,
      endDateStr,
      exportTimestamp
    );

    XLSX.utils.book_append_sheet(workbook, ws1, 'Tổng hợp thi đua');
    XLSX.utils.book_append_sheet(workbook, ws2, 'Chi tiết ghi nhận');
  }

  const safeClassName = className
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\u00C0-\u1EF9]/g, '');
  const fileName = `Thi_dua_${safeClassName}_${startDateStr}_${endDateStr}.xlsx`;

  if (!skipFileWrite) {
    XLSX.writeFile(workbook, fileName);
  }

  return {
    workbook,
    fileName,
    totalStudents,
    totalRecords,
  };
}
