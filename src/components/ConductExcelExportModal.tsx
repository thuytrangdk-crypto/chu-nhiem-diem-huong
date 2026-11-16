import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Calendar,
  CalendarRange,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Info,
  Lock,
  School,
  UserCheck,
  X,
} from 'lucide-react';
import { ClassSettings, ConductRecord, SemesterKey, Student } from '../types';
import {
  computeConductSummary,
  computeFullYearConductSummary,
  exportConductToExcel,
  getVietnamNow,
  toDateStringVN,
} from '../utils/conductExcelExport';
import { formatDateVN } from '../utils/storage';
import {
  SEMESTER_BASE_SCORE,
  buildDefaultAcademicYearConfig,
  getAcademicYearsConfig,
  getActiveTerm,
  getAllAcademicYears,
  normalizeAcademicYear,
} from '../utils/conductHelpers';

interface ConductExcelExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  conduct: ConductRecord[];
  settings: ClassSettings;
  classNameTitle: string;
  isTeacherLoggedIn?: boolean;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type PeriodType = 'week' | 'month' | 'semester' | 'year' | 'custom';

export const ConductExcelExportModal: React.FC<ConductExcelExportModalProps> = ({
  isOpen,
  onClose,
  students,
  conduct,
  settings,
  classNameTitle,
  isTeacherLoggedIn = true,
  onShowToast,
}) => {
  const yearConfigs = useMemo(() => getAcademicYearsConfig(settings), [settings]);
  const activeTerm = useMemo(() => getActiveTerm(settings), [settings]);
  const availableYears = useMemo(
    () => getAllAcademicYears(settings, conduct),
    [settings, conduct]
  );

  const [periodType, setPeriodType] = useState<PeriodType>('semester');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>(
    activeTerm.academicYear
  );

  // Sub-options
  const [weekSubOption, setWeekSubOption] = useState<'this_week' | 'last_week' | 'last_7_days'>(
    'this_week'
  );
  const [monthSubOption, setMonthSubOption] = useState<
    'this_month' | 'last_month' | 'custom_month'
  >('this_month');
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(() =>
    getVietnamNow().getMonth()
  );
  const [semesterSubOption, setSemesterSubOption] = useState<SemesterKey>(activeTerm.semester);

  useEffect(() => {
    if (isOpen) {
      setSelectedAcademicYear(activeTerm.academicYear);
      setSemesterSubOption(activeTerm.semester);
    }
  }, [isOpen, activeTerm.academicYear, activeTerm.semester]);

  // Custom date range
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const vn = getVietnamNow();
    const firstDay = new Date(vn.getFullYear(), vn.getMonth(), 1);
    return toDateStringVN(firstDay);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() =>
    toDateStringVN(getVietnamNow())
  );

  const [isExporting, setIsExporting] = useState(false);
  const [exportTimeStr, setExportTimeStr] = useState<string>('');

  // Cập nhật thời gian xuất thời gian thực theo múi giờ VN
  useEffect(() => {
    const updateTime = () => {
      const now = getVietnamNow();
      const hours = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      const secs = String(now.getSeconds()).padStart(2, '0');
      const dateVN = formatDateVN(toDateStringVN(now));
      setExportTimeStr(`${hours}:${mins}:${secs}, ngày ${dateVN}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const selectedYearConfig = useMemo(() => {
    const norm = normalizeAcademicYear(selectedAcademicYear);
    return (
      yearConfigs.find((c) => normalizeAcademicYear(c.academicYear) === norm) ||
      buildDefaultAcademicYearConfig(norm)
    );
  }, [yearConfigs, selectedAcademicYear]);

  // Tính toán khoảng ngày [startDateStr, endDateStr] và nhãn theo kỳ
  const { startDateStr, endDateStr, periodLabel, semesterFilter, exportMode } = useMemo(() => {
    const vnNow = getVietnamNow();
    const currentYear = vnNow.getFullYear();

    if (periodType === 'week') {
      if (weekSubOption === 'this_week') {
        const day = vnNow.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        const monday = new Date(vnNow);
        monday.setDate(vnNow.getDate() + diffToMonday);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return {
          startDateStr: toDateStringVN(monday),
          endDateStr: toDateStringVN(sunday),
          periodLabel: 'Tuần này',
          semesterFilter: undefined,
          exportMode: 'period' as const,
        };
      }
      if (weekSubOption === 'last_week') {
        const day = vnNow.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        const lastMonday = new Date(vnNow);
        lastMonday.setDate(vnNow.getDate() + diffToMonday - 7);
        const lastSunday = new Date(lastMonday);
        lastSunday.setDate(lastMonday.getDate() + 6);
        return {
          startDateStr: toDateStringVN(lastMonday),
          endDateStr: toDateStringVN(lastSunday),
          periodLabel: 'Tuần trước',
          semesterFilter: undefined,
          exportMode: 'period' as const,
        };
      }
      const past7 = new Date(vnNow);
      past7.setDate(vnNow.getDate() - 6);
      return {
        startDateStr: toDateStringVN(past7),
        endDateStr: toDateStringVN(vnNow),
        periodLabel: '7 ngày gần nhất',
        semesterFilter: undefined,
        exportMode: 'period' as const,
      };
    }

    if (periodType === 'month') {
      if (monthSubOption === 'this_month') {
        const firstDay = new Date(vnNow.getFullYear(), vnNow.getMonth(), 1);
        const lastDay = new Date(vnNow.getFullYear(), vnNow.getMonth() + 1, 0);
        return {
          startDateStr: toDateStringVN(firstDay),
          endDateStr: toDateStringVN(lastDay),
          periodLabel: `Tháng ${vnNow.getMonth() + 1}/${vnNow.getFullYear()}`,
          semesterFilter: undefined,
          exportMode: 'period' as const,
        };
      }
      if (monthSubOption === 'last_month') {
        const firstDay = new Date(vnNow.getFullYear(), vnNow.getMonth() - 1, 1);
        const lastDay = new Date(vnNow.getFullYear(), vnNow.getMonth(), 0);
        return {
          startDateStr: toDateStringVN(firstDay),
          endDateStr: toDateStringVN(lastDay),
          periodLabel: `Tháng ${firstDay.getMonth() + 1}/${firstDay.getFullYear()}`,
          semesterFilter: undefined,
          exportMode: 'period' as const,
        };
      }
      const firstDay = new Date(currentYear, selectedMonthIndex, 1);
      const lastDay = new Date(currentYear, selectedMonthIndex + 1, 0);
      return {
        startDateStr: toDateStringVN(firstDay),
        endDateStr: toDateStringVN(lastDay),
        periodLabel: `Tháng ${selectedMonthIndex + 1}/${currentYear}`,
        semesterFilter: undefined,
        exportMode: 'period' as const,
      };
    }

    if (periodType === 'semester') {
      if (semesterSubOption === 'HK1') {
        return {
          startDateStr: selectedYearConfig.hk1Start,
          endDateStr: selectedYearConfig.hk1End,
          periodLabel: `Học kỳ I (${selectedYearConfig.academicYear})`,
          semesterFilter: 'HK1' as SemesterKey,
          exportMode: 'semester' as const,
        };
      }
      return {
        startDateStr: selectedYearConfig.hk2Start,
        endDateStr: selectedYearConfig.hk2End,
        periodLabel: `Học kỳ II (${selectedYearConfig.academicYear})`,
        semesterFilter: 'HK2' as SemesterKey,
        exportMode: 'semester' as const,
      };
    }

    if (periodType === 'year') {
      return {
        startDateStr: selectedYearConfig.hk1Start,
        endDateStr: selectedYearConfig.hk2End,
        periodLabel: `Cả năm học ${selectedYearConfig.academicYear}`,
        semesterFilter: 'ALL' as const,
        exportMode: 'full_year' as const,
      };
    }

    return {
      startDateStr: customStartDate,
      endDateStr: customEndDate,
      periodLabel: `Tùy chọn (${formatDateVN(customStartDate)} - ${formatDateVN(customEndDate)})`,
      semesterFilter: undefined,
      exportMode: 'period' as const,
    };
  }, [
    periodType,
    weekSubOption,
    monthSubOption,
    selectedMonthIndex,
    semesterSubOption,
    selectedYearConfig,
    customStartDate,
    customEndDate,
  ]);

  const isDateRangeValid = useMemo(() => {
    if (!startDateStr || !endDateStr) return false;
    return startDateStr <= endDateStr;
  }, [startDateStr, endDateStr]);

  // Xem trước số liệu thi đua thực tế trước khi xuất
  const previewStats = useMemo(() => {
    if (!isOpen || !students || students.length === 0 || !isDateRangeValid) {
      return null;
    }
    try {
      if (exportMode === 'full_year') {
        const res = computeFullYearConductSummary(
          students,
          conduct,
          selectedAcademicYear,
          yearConfigs,
          settings.ratingThresholds
        );
        return {
          totalStudents: res.summaries.length,
          totalRecords: res.yearRecords.length,
          praiseCount: res.yearRecords.filter((r) => r.type === 'praise' || (r.points || 0) > 0)
            .length,
          reminderCount: res.yearRecords.filter(
            (r) => r.type === 'reminder' || (r.points || 0) < 0
          ).length,
        };
      }

      const res = computeConductSummary(
        students,
        conduct,
        startDateStr,
        endDateStr,
        settings.ratingThresholds,
        semesterFilter
          ? {
              academicYear: selectedAcademicYear,
              semester: semesterFilter,
              yearConfigs,
            }
          : { yearConfigs }
      );

      return {
        totalStudents: res.summaries.length,
        totalRecords: res.periodRecords.length,
        praiseCount: res.periodRecords.filter((r) => r.type === 'praise' || (r.points || 0) > 0)
          .length,
        reminderCount: res.periodRecords.filter(
          (r) => r.type === 'reminder' || (r.points || 0) < 0
        ).length,
      };
    } catch {
      return null;
    }
  }, [
    isOpen,
    students,
    conduct,
    isDateRangeValid,
    exportMode,
    selectedAcademicYear,
    yearConfigs,
    settings.ratingThresholds,
    startDateStr,
    endDateStr,
    semesterFilter,
  ]);

  if (!isOpen) return null;

  const handleExport = () => {
    if (!isTeacherLoggedIn) {
      onShowToast('Chỉ giáo viên chủ nhiệm mới được sử dụng chức năng xuất Excel thi đua!', 'error');
      return;
    }
    if (!isDateRangeValid) {
      onShowToast('Khoảng ngày không hợp lệ! Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.', 'error');
      return;
    }
    if (!students || students.length === 0) {
      onShowToast('Không có dữ liệu học sinh trong lớp đang chọn để xuất file!', 'error');
      return;
    }

    setIsExporting(true);
    try {
      const result = exportConductToExcel({
        students,
        conduct,
        settings,
        classNameTitle: classNameTitle || settings.className || 'Lớp 9A5',
        periodLabel,
        startDateStr,
        endDateStr,
        exportTimestamp: exportTimeStr,
        academicYear: selectedAcademicYear,
        semesterFilter,
        exportMode,
      });

      onShowToast(
        `Đã xuất thành công tệp "${result.fileName}" gồm ${result.totalStudents} học sinh và ${result.totalRecords} ghi nhận thi đua!`,
        'success'
      );
      onClose();
    } catch (err: unknown) {
      console.error(err);
      const message =
        err instanceof Error
          ? err.message
          : 'Lỗi khi xuất file Excel thi đua. Vui lòng thử lại!';
      onShowToast(message, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const totMin = settings.ratingThresholds?.year?.totMin ?? 90;
  const khaMin = settings.ratingThresholds?.year?.khaMin ?? 75;
  const datMin = settings.ratingThresholds?.year?.datMin ?? 50;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-blue-700 via-indigo-700 to-teal-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/15 rounded-2xl backdrop-blur-md shadow-inner">
              <FileSpreadsheet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-black text-lg sm:text-xl tracking-tight leading-tight">
                Xuất Excel Thi Đua Toàn Bộ Học Sinh
              </h3>
              <p className="text-xs text-blue-100/90 font-medium mt-0.5">
                {classNameTitle || settings.className} • Trường {settings.schoolName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            title="Đóng hộp thoại"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-slate-700">
          {!isTeacherLoggedIn && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Chức năng Xuất Excel thi đua chỉ dành cho Giáo viên chủ nhiệm.</span>
            </div>
          )}

          {/* Thông tin lớp & Thời gian xuất */}
          <div className="bg-gradient-to-br from-blue-50/80 via-indigo-50/50 to-slate-50 p-4 rounded-2xl border border-blue-100/80 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="flex items-center space-x-2.5">
              <School className="w-4 h-4 text-blue-600 shrink-0" />
              <div className="truncate">
                <span className="text-slate-400 font-medium">Lớp đang chọn:</span>{' '}
                <strong className="text-slate-800 font-bold">
                  {classNameTitle || settings.className}
                </strong>
                <span className="ml-1 text-blue-700 font-semibold">
                  ({students.length} học sinh)
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2.5">
              <UserCheck className="w-4 h-4 text-teal-600 shrink-0" />
              <div className="truncate">
                <span className="text-slate-400 font-medium">Giáo viên chủ nhiệm:</span>{' '}
                <strong className="text-slate-800 font-bold">{settings.teacherName}</strong>
              </div>
            </div>

            <div className="flex items-center space-x-2.5">
              <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
              <div>
                <span className="text-slate-400 font-medium">Năm học xuất:</span>{' '}
                <strong className="text-slate-800 font-bold">{selectedAcademicYear}</strong>
              </div>
            </div>

            <div className="flex items-center space-x-2.5">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <span className="text-slate-400 font-medium">Thời gian xuất:</span>{' '}
                <strong className="text-slate-800 font-bold">
                  {exportTimeStr || 'Đang cập nhật...'}
                </strong>
              </div>
            </div>
          </div>

          {/* Chọn kỳ báo cáo */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <CalendarRange className="w-4 h-4 text-blue-600" />
                <span>1. Chọn kỳ báo cáo thi đua:</span>
              </label>

              {(periodType === 'semester' || periodType === 'year') && (
                <select
                  value={selectedAcademicYear}
                  onChange={(e) => setSelectedAcademicYear(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      Năm học {yr}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { id: 'semester', label: 'Học kỳ' },
                { id: 'year', label: 'Cả năm' },
                { id: 'week', label: 'Theo Tuần' },
                { id: 'month', label: 'Theo Tháng' },
                { id: 'custom', label: 'Tùy chọn' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPeriodType(tab.id as PeriodType)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                    periodType === tab.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Chi tiết tùy chọn theo từng kỳ */}
            <div className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl text-xs">
              {periodType === 'week' && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-600">Chọn tuần:</span>
                  {[
                    { id: 'this_week', label: 'Tuần này' },
                    { id: 'last_week', label: 'Tuần trước' },
                    { id: 'last_7_days', label: '7 ngày gần nhất' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        setWeekSubOption(opt.id as 'this_week' | 'last_week' | 'last_7_days')
                      }
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                        weekSubOption === opt.id
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {periodType === 'month' && (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-600">Chọn tháng:</span>
                    {[
                      { id: 'this_month', label: 'Tháng này' },
                      { id: 'last_month', label: 'Tháng trước' },
                      { id: 'custom_month', label: 'Chọn tháng khác' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          setMonthSubOption(
                            opt.id as 'this_month' | 'last_month' | 'custom_month'
                          )
                        }
                        className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                          monthSubOption === opt.id
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {monthSubOption === 'custom_month' && (
                    <div className="pt-2 border-t border-slate-200/80 flex items-center gap-2">
                      <span className="text-slate-600">Tháng:</span>
                      <select
                        value={selectedMonthIndex}
                        onChange={(e) => setSelectedMonthIndex(Number(e.target.value))}
                        className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      >
                        {Array.from({ length: 12 }, (_, i) => (
                          <option key={i} value={i}>
                            Tháng {i + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {periodType === 'semester' && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-600">Chọn học kỳ:</span>
                  {[
                    {
                      id: 'HK1' as SemesterKey,
                      label: `Học kỳ I (${formatDateVN(selectedYearConfig.hk1Start)} – ${formatDateVN(
                        selectedYearConfig.hk1End
                      )})`,
                    },
                    {
                      id: 'HK2' as SemesterKey,
                      label: `Học kỳ II (${formatDateVN(selectedYearConfig.hk2Start)} – ${formatDateVN(
                        selectedYearConfig.hk2End
                      )})`,
                    },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSemesterSubOption(opt.id)}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                        semesterSubOption === opt.id
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {periodType === 'year' && (
                <div className="text-slate-700 leading-relaxed">
                  Xuất báo cáo <b>Cả năm học {selectedAcademicYear}</b> gồm các cột tách riêng cho{' '}
                  <b>Học kỳ I (200đ)</b> và <b>Học kỳ II (200đ)</b> (tổng điểm thưởng, tổng điểm trừ,
                  điểm thi đua và hạnh kiểm từng học kỳ — không cộng dồn 400đ).
                </div>
              )}

              {periodType === 'custom' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                      Từ ngày (Bao gồm):
                    </label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                      Đến ngày (Bao gồm):
                    </label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* Tóm tắt khoảng ngày thực tế sẽ lấy */}
              <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between font-medium">
                <span className="text-slate-500">Khoảng thời gian xuất:</span>
                <span className="font-bold text-blue-700">
                  Từ ngày {formatDateVN(startDateStr)} đến ngày {formatDateVN(endDateStr)}
                </span>
              </div>
            </div>
          </div>

          {/* Quy tắc tính điểm & Xếp loại của ứng dụng */}
          <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200/80 text-xs space-y-1.5">
            <div className="font-bold text-amber-900 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-600" />
              <span>Quy tắc tính điểm thi đua theo học kỳ:</span>
            </div>
            <ul className="text-amber-800/90 list-disc list-inside space-y-0.5 pl-1 leading-relaxed">
              <li>
                <b>Điểm khởi tạo mỗi học kỳ:</b> {SEMESTER_BASE_SCORE} điểm.{' '}
                <b>Điểm thi đua học kỳ</b> = {SEMESTER_BASE_SCORE} + Tổng điểm thưởng - Tổng điểm
                trừ trong học kỳ.
              </li>
              <li>
                <b>Độc lập từng học kỳ:</b> Điểm cộng/trừ Học kỳ I không ảnh hưởng sang Học kỳ II.
              </li>
              <li>
                <b>Xếp loại hạnh kiểm mỗi học kỳ:</b> Tốt (≥ {totMin}đ), Khá (≥ {khaMin}đ), Đạt (≥{' '}
                {datMin}đ), Chưa đạt (&lt; {datMin}đ).
              </li>
            </ul>
          </div>

          {/* Thống kê dữ liệu thực tế trước khi xuất */}
          {previewStats ? (
            <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200/80 text-xs">
              <div className="font-bold text-emerald-900 flex items-center gap-1.5 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Số liệu thực tế sẽ được xuất vào file Excel:</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-white p-2 rounded-xl border border-emerald-100 shadow-2xs">
                  <div className="text-base font-black text-slate-800">
                    {previewStats.totalStudents}
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    Học sinh (Đầy đủ 100%)
                  </div>
                </div>
                <div className="bg-white p-2 rounded-xl border border-emerald-100 shadow-2xs">
                  <div className="text-base font-black text-blue-600">
                    {previewStats.totalRecords}
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">Sự việc trong kỳ</div>
                </div>
                <div className="bg-white p-2 rounded-xl border border-emerald-100 shadow-2xs">
                  <div className="text-base font-black text-emerald-600">
                    {previewStats.praiseCount}
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">Lượt tích cực (+)</div>
                </div>
                <div className="bg-white p-2 rounded-xl border border-emerald-100 shadow-2xs">
                  <div className="text-base font-black text-rose-600">
                    {previewStats.reminderCount}
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">Lượt vi phạm (-)</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-rose-50 p-3 rounded-2xl border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>
                Khoảng thời gian không hợp lệ hoặc không có dữ liệu học sinh trong lớp đang chọn.
              </span>
            </div>
          )}

          {/* Cấu trúc 2 sheet của file Excel */}
          <div className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded-2xl border border-slate-200 flex items-start gap-2">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              Tệp <b>.xlsx</b> gồm 2 sheet: <b>“Tổng hợp thi đua”</b> (cố định tiêu đề, bật lọc; với{' '}
              <b>Cả năm</b> có các cột tách riêng HK I và HK II) và <b>“Chi tiết ghi nhận”</b> (kèm
              năm học, học kỳ, thời gian và người ghi nhận).
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || !isDateRangeValid || !isTeacherLoggedIn}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>{isExporting ? 'Đang xuất Excel...' : 'Tải file Excel thi đua (.xlsx)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
