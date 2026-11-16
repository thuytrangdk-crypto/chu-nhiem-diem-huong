import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Calendar,
  Edit2,
  FileSpreadsheet,
  Plus,
  Sliders,
  Sparkles,
  Trash2,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import {
  AcademicYearConfig,
  ClassSettings,
  ConductCriterion,
  ConductRecord,
  SemesterKey,
  Student,
} from '../types';
import { formatDateVN } from '../utils/storage';
import {
  SEMESTER_BASE_SCORE,
  buildDefaultAcademicYearConfig,
  computeStudentSemesterConduct,
  detectTermByDate,
  filterConductByTerm,
  getAcademicYearsConfig,
  getActiveTerm,
  getAllAcademicYears,
  getSemesterLabel,
  getTodayVNDateString,
  normalizeAcademicYear,
  resolveRecordTerm,
} from '../utils/conductHelpers';
import { ConductExcelExportModal } from './ConductExcelExportModal';

interface ConductViewProps {
  students: Student[];
  criteria: ConductCriterion[];
  conduct: ConductRecord[];
  settings?: ClassSettings;
  classNameTitle?: string;
  isTeacherLoggedIn?: boolean;
  onAddConductRecord: (record: Omit<ConductRecord, 'id'>) => void;
  onUpdateConductRecord?: (record: ConductRecord) => void;
  onDeleteConductRecord: (recordId: string) => void;
  onUpdateCriteria: (criteria: ConductCriterion[]) => void;
  onUpdateSettings?: (settings: ClassSettings) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onOpenStudentProfile: (studentId: string) => void;
}

export const ConductView: React.FC<ConductViewProps> = ({
  students,
  criteria,
  conduct,
  settings,
  classNameTitle = 'Lớp 9A5',
  isTeacherLoggedIn = true,
  onAddConductRecord,
  onUpdateConductRecord,
  onDeleteConductRecord,
  onUpdateCriteria,
  onUpdateSettings,
  onShowToast,
  onOpenStudentProfile,
}) => {
  const effectiveSettings: ClassSettings = useMemo(
    () =>
      settings || {
        schoolName: 'THCS Nguyễn Huệ - Phường Phú Thọ Hòa',
        className: classNameTitle || 'Lớp 9A5',
        teacherName: 'Nguyễn Thị Diểm Hương',
        academicYear: '2026 - 2027',
        semester: 'Học kỳ I',
        targetStudentsCount: students.length,
      },
    [settings, classNameTitle, students.length]
  );

  const yearConfigs = useMemo(
    () => getAcademicYearsConfig(effectiveSettings),
    [effectiveSettings]
  );
  const activeTerm = useMemo(
    () => getActiveTerm(effectiveSettings),
    [effectiveSettings]
  );
  const availableAcademicYears = useMemo(
    () => getAllAcademicYears(effectiveSettings, conduct),
    [effectiveSettings, conduct]
  );

  // Bộ lọc Năm học & Học kỳ ('HK1' | 'HK2' | 'ALL')
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>(activeTerm.academicYear);
  const [selectedSemesterFilter, setSelectedSemesterFilter] = useState<SemesterKey | 'ALL'>(
    activeTerm.semester
  );

  const [isCriteriaModalOpen, setIsCriteriaModalOpen] = useState(false);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isTermConfigModalOpen, setIsTermConfigModalOpen] = useState(false);

  // Form Thêm Ghi nhận thi đua
  const [selectedStudentId, setSelectedStudentId] = useState<string>(students[0]?.id || '');
  const [selectedCriterionId, setSelectedCriterionId] = useState<string>(criteria[0]?.id || '');
  const [customPoints, setCustomPoints] = useState<number>(criteria[0]?.points || 2);
  const [recordNote, setRecordNote] = useState<string>('');
  const [recordDate, setRecordDate] = useState<string>(() => getTodayVNDateString());
  const [manualTermYear, setManualTermYear] = useState<string>(activeTerm.academicYear);
  const [manualTermSemester, setManualTermSemester] = useState<SemesterKey>(activeTerm.semester);

  // Form Chỉnh sửa sự việc thi đua
  const [editingRecord, setEditingRecord] = useState<ConductRecord | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editCriterionName, setEditCriterionName] = useState<string>('');
  const [editPoints, setEditPoints] = useState<number>(0);
  const [editNote, setEditNote] = useState<string>('');
  const [editManualYear, setEditManualYear] = useState<string>(activeTerm.academicYear);
  const [editManualSemester, setEditManualSemester] = useState<SemesterKey>(activeTerm.semester);

  // Form cấu hình lịch học kỳ
  const [draftConfigs, setDraftConfigs] = useState<AcademicYearConfig[]>(yearConfigs);
  const [newYearInput, setNewYearInput] = useState<string>('2028 - 2029');

  useEffect(() => {
    setDraftConfigs(yearConfigs);
  }, [yearConfigs]);

  const recordTermDetection = useMemo(
    () => detectTermByDate(recordDate, yearConfigs, activeTerm.academicYear),
    [recordDate, yearConfigs, activeTerm.academicYear]
  );

  useEffect(() => {
    setManualTermYear(recordTermDetection.academicYear);
    setManualTermSemester(recordTermDetection.semester);
  }, [recordTermDetection.academicYear, recordTermDetection.semester]);

  const editTermDetection = useMemo(
    () => detectTermByDate(editDate, yearConfigs, activeTerm.academicYear),
    [editDate, yearConfigs, activeTerm.academicYear]
  );

  // Form Thêm Tiêu chí mới
  const [newCritName, setNewCritName] = useState('');
  const [newCritPoints, setNewCritPoints] = useState(2);
  const [newCritType, setNewCritType] = useState<'praise' | 'reminder'>('praise');
  const [newCritCategory, setNewCritCategory] = useState('Học tập');

  // Khi chọn tiêu chí thì tự động fill số điểm
  const handleCriterionChange = (critId: string) => {
    setSelectedCriterionId(critId);
    const found = criteria.find((c) => c.id === critId);
    if (found) {
      setCustomPoints(found.points);
    }
  };

  const handleSubmitRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) {
      onShowToast('Vui lòng chọn học sinh', 'error');
      return;
    }

    const crit = criteria.find((c) => c.id === selectedCriterionId);
    const critName = crit ? crit.name : 'Thi đua nề nếp';
    const type = customPoints >= 0 ? 'praise' : 'reminder';
    const targetYear = recordTermDetection.matched
      ? recordTermDetection.academicYear
      : normalizeAcademicYear(manualTermYear);
    const targetSemester = recordTermDetection.matched
      ? recordTermDetection.semester
      : manualTermSemester;

    onAddConductRecord({
      date: recordDate,
      studentId: selectedStudentId,
      criterionId: selectedCriterionId,
      criterionName: critName,
      points: customPoints,
      type,
      note: recordNote.trim() || undefined,
      academicYear: targetYear,
      semester: targetSemester,
    });

    const studentObj = students.find((s) => s.id === selectedStudentId);
    const termLabel = `${getSemesterLabel(targetSemester)} (${targetYear})`;
    if (!recordTermDetection.matched) {
      onShowToast(
        `Đã ghi nhận cho ${studentObj?.name} vào ${termLabel}. Lưu ý: ngày ${formatDateVN(recordDate)} nằm ngoài khoảng thời gian học kỳ đã cấu hình!`,
        'info'
      );
    } else {
      onShowToast(
        `Đã ghi nhận ${customPoints > 0 ? '+' : ''}${customPoints}đ cho ${studentObj?.name} (${termLabel})!`
      );
    }

    setSelectedAcademicYear(targetYear);
    if (selectedSemesterFilter !== 'ALL') {
      setSelectedSemesterFilter(targetSemester);
    }

    setIsRecordModalOpen(false);
    setRecordNote('');
  };

  const openEditRecordModal = (rec: ConductRecord) => {
    const resolved = resolveRecordTerm(rec, yearConfigs, activeTerm.academicYear);
    setEditingRecord(rec);
    setEditDate(rec.date);
    setEditCriterionName(rec.criterionName);
    setEditPoints(rec.points);
    setEditNote(rec.note || '');
    setEditManualYear(resolved.academicYear);
    setEditManualSemester(resolved.semester);
  };

  const handleSaveEditedRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord || !onUpdateConductRecord) return;
    if (!editCriterionName.trim()) {
      onShowToast('Vui lòng nhập nội dung sự việc', 'error');
      return;
    }

    const nextYear = editTermDetection.matched
      ? editTermDetection.academicYear
      : normalizeAcademicYear(editManualYear);
    const nextSemester = editTermDetection.matched
      ? editTermDetection.semester
      : editManualSemester;
    const pts = Number(editPoints) || 0;

    onUpdateConductRecord({
      ...editingRecord,
      date: editDate,
      criterionName: editCriterionName.trim(),
      points: pts,
      type: pts >= 0 ? 'praise' : 'reminder',
      note: editNote.trim() || undefined,
      academicYear: nextYear,
      semester: nextSemester,
    });

    onShowToast(
      `Đã cập nhật sự việc & tính lại điểm ${getSemesterLabel(nextSemester)} (${nextYear})`
    );
    setEditingRecord(null);
  };

  const handleAddCriterion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCritName.trim()) return;

    const pointsValue =
      newCritType === 'reminder' ? -Math.abs(newCritPoints) : Math.abs(newCritPoints);
    const newCrit: ConductCriterion = {
      id: `crit-${Date.now()}`,
      name: newCritName.trim(),
      points: pointsValue,
      type: newCritType,
      category: newCritCategory,
    };

    onUpdateCriteria([...criteria, newCrit]);
    onShowToast('Đã thêm tiêu chí mới vào hệ thống!');
    setNewCritName('');
  };

  const handleDeleteCriterion = (id: string) => {
    onUpdateCriteria(criteria.filter((c) => c.id !== id));
    onShowToast('Đã xóa tiêu chí khỏi danh sách');
  };

  const handleSaveTermConfigs = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateSettings) return;

    for (const cfg of draftConfigs) {
      if (!cfg.hk1Start || !cfg.hk1End || !cfg.hk2Start || !cfg.hk2End) {
        onShowToast(`Vui lòng nhập đủ ngày bắt đầu/kết thúc cho năm học ${cfg.academicYear}`, 'error');
        return;
      }
      if (cfg.hk1Start > cfg.hk1End || cfg.hk2Start > cfg.hk2End || cfg.hk1End >= cfg.hk2Start) {
        onShowToast(
          `Khoảng ngày học kỳ của năm học ${cfg.academicYear} không hợp lệ (HK I phải kết thúc trước khi HK II bắt đầu).`,
          'error'
        );
        return;
      }
    }

    onUpdateSettings({
      ...effectiveSettings,
      academicYearsConfig: draftConfigs.map((c) => ({
        ...c,
        academicYear: normalizeAcademicYear(c.academicYear),
      })),
    });
    onShowToast('Đã lưu lịch học kỳ theo năm học!');
    setIsTermConfigModalOpen(false);
  };

  const handleAddAcademicYearConfig = () => {
    const normalized = normalizeAcademicYear(newYearInput);
    if (!/^\d{4}\s-\s\d{4}$/.test(normalized)) {
      onShowToast('Vui lòng nhập năm học đúng định dạng VD: 2028 - 2029', 'error');
      return;
    }
    if (draftConfigs.some((c) => normalizeAcademicYear(c.academicYear) === normalized)) {
      onShowToast(`Năm học ${normalized} đã có trong cấu hình`, 'info');
      return;
    }
    setDraftConfigs([...draftConfigs, buildDefaultAcademicYearConfig(normalized)]);
  };

  // Lọc lịch sử theo Năm học và Học kỳ đang chọn
  const filteredConduct = useMemo(
    () =>
      filterConductByTerm(
        conduct,
        selectedAcademicYear,
        selectedSemesterFilter,
        yearConfigs
      ).sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [conduct, selectedAcademicYear, selectedSemesterFilter, yearConfigs]
  );

  // Tính điểm từng học sinh (200 điểm khởi tạo độc lập cho mỗi học kỳ)
  const studentScores = useMemo(() => {
    return students.map((s) => {
      const hk1 = computeStudentSemesterConduct(
        s.id,
        conduct,
        selectedAcademicYear,
        'HK1',
        yearConfigs,
        effectiveSettings.ratingThresholds
      );
      const hk2 = computeStudentSemesterConduct(
        s.id,
        conduct,
        selectedAcademicYear,
        'HK2',
        yearConfigs,
        effectiveSettings.ratingThresholds
      );

      const viewed = selectedSemesterFilter === 'HK2' ? hk2 : hk1;
      return {
        student: s,
        hk1,
        hk2,
        score: viewed.totalScore,
        praiseCount:
          selectedSemesterFilter === 'ALL'
            ? hk1.praiseCount + hk2.praiseCount
            : viewed.praiseCount,
        reminderCount:
          selectedSemesterFilter === 'ALL'
            ? hk1.reminderCount + hk2.reminderCount
            : viewed.reminderCount,
        ratingInfo: viewed.ratingInfo,
      };
    });
  }, [students, conduct, selectedAcademicYear, selectedSemesterFilter, yearConfigs, effectiveSettings.ratingThresholds]);

  // Xếp hạng cá nhân
  const rankedStudents = useMemo(() => {
    return [...studentScores].sort((a, b) => {
      if (selectedSemesterFilter === 'ALL') {
        const avgA = (a.hk1.totalScore + a.hk2.totalScore) / 2;
        const avgB = (b.hk1.totalScore + b.hk2.totalScore) / 2;
        if (avgB !== avgA) return avgB - avgA;
        return a.student.name.localeCompare(b.student.name, 'vi');
      }
      if (b.score !== a.score) return b.score - a.score;
      return a.student.name.localeCompare(b.student.name, 'vi');
    });
  }, [studentScores, selectedSemesterFilter]);

  // Xếp hạng Tổ (Tổ 1, 2, 3, 4)
  const rankedGroups = useMemo(() => {
    const groups = [1, 2, 3, 4].map((groupNum) => {
      const groupStudents = studentScores.filter((item) => item.student.group === groupNum);
      const count = groupStudents.length;

      const hk1Sum = groupStudents.reduce((sum, item) => sum + item.hk1.totalScore, 0);
      const hk2Sum = groupStudents.reduce((sum, item) => sum + item.hk2.totalScore, 0);
      const avgHk1 = count > 0 ? (hk1Sum / count).toFixed(1) : '200.0';
      const avgHk2 = count > 0 ? (hk2Sum / count).toFixed(1) : '200.0';

      const totalScore =
        selectedSemesterFilter === 'HK2' ? hk2Sum : hk1Sum;
      const avgScore =
        selectedSemesterFilter === 'HK2' ? avgHk2 : avgHk1;
      const sortValue =
        selectedSemesterFilter === 'ALL'
          ? (Number(avgHk1) + Number(avgHk2)) / 2
          : Number(avgScore);

      return {
        groupNum,
        studentCount: count,
        totalScore,
        avgScore,
        avgHk1,
        avgHk2,
        sortValue,
      };
    });

    return groups.sort((a, b) => b.sortValue - a.sortValue);
  }, [studentScores, selectedSemesterFilter]);

  const activeConfigForSelectedYear = yearConfigs.find(
    (c) => normalizeAcademicYear(c.academicYear) === normalizeAcademicYear(selectedAcademicYear)
  );

  const originalEditTerm = editingRecord
    ? resolveRecordTerm(editingRecord, yearConfigs, activeTerm.academicYear)
    : null;
  const nextEditYear = editTermDetection.matched
    ? editTermDetection.academicYear
    : normalizeAcademicYear(editManualYear);
  const nextEditSemester = editTermDetection.matched
    ? editTermDetection.semester
    : editManualSemester;
  const isCrossSemesterMove =
    !!originalEditTerm &&
    (originalEditTerm.academicYear !== nextEditYear ||
      originalEditTerm.semester !== nextEditSemester);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Top Banner & Actions */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* Left: Bộ lọc Năm học & Học kỳ */}
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={selectedAcademicYear}
              onChange={(e) => setSelectedAcademicYear(e.target.value)}
              className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:border-blue-500 cursor-pointer"
              title="Chọn năm học"
            >
              {availableAcademicYears.map((yr) => (
                <option key={yr} value={yr}>
                  Năm học {yr}
                </option>
              ))}
            </select>

            <div className="flex items-center space-x-1 p-1 bg-slate-100 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setSelectedSemesterFilter('HK1')}
                className={`px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  selectedSemesterFilter === 'HK1'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Học kỳ I
              </button>
              <button
                type="button"
                onClick={() => setSelectedSemesterFilter('HK2')}
                className={`px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  selectedSemesterFilter === 'HK2'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Học kỳ II
              </button>
              <button
                type="button"
                onClick={() => setSelectedSemesterFilter('ALL')}
                className={`px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  selectedSemesterFilter === 'ALL'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cả năm
              </button>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {isTeacherLoggedIn && onUpdateSettings && (
              <button
                type="button"
                onClick={() => setIsTermConfigModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                <Calendar className="w-4 h-4 text-blue-600" />
                Lịch học kỳ
              </button>
            )}

            {isTeacherLoggedIn && (
              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Xuất Excel thi đua
              </button>
            )}

            {isTeacherLoggedIn && (
              <button
                type="button"
                onClick={() => setIsCriteriaModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                <Sliders className="w-4 h-4 text-slate-500" />
                Tùy chỉnh tiêu chí ({criteria.length})
              </button>
            )}

            {isTeacherLoggedIn && (
              <button
                type="button"
                onClick={() => setIsRecordModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Ghi nhận thi đua
              </button>
            )}
          </div>
        </div>

        {/* Dải thông tin học kỳ đang diễn ra & nguyên tắc 200đ/học kỳ */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 font-bold border border-blue-200">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              Đang diễn ra: {getSemesterLabel(activeTerm.semester)} ({activeTerm.academicYear})
            </span>
            {activeConfigForSelectedYear && (
              <span className="text-[11px] text-slate-500">
                HK I: {formatDateVN(activeConfigForSelectedYear.hk1Start)} – {formatDateVN(activeConfigForSelectedYear.hk1End)} | HK II: {formatDateVN(activeConfigForSelectedYear.hk2Start)} – {formatDateVN(activeConfigForSelectedYear.hk2End)}
              </span>
            )}
          </div>
          <span className="text-[11px] font-semibold text-slate-500">
            Mỗi học kỳ khởi tạo độc lập <b className="text-slate-800">200/200 điểm</b>
          </span>
        </div>
      </div>

      {/* Grid: 2 Bảng Xếp Hạng Lớn (Cá Nhân Nổi Bật & Tổ Nổi Bật) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cột 1 & 2: BẢNG XẾP HẠNG CÁ NHÂN */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-500/10 via-teal-500/10 to-blue-500/10 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-amber-500 text-white rounded-xl shadow-sm">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 text-sm sm:text-base">
                  BẢNG XẾP HẠNG CÁ NHÂN
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedSemesterFilter === 'ALL'
                    ? `Năm học ${selectedAcademicYear} • Hiển thị độc lập HK I & HK II (không cộng dồn)`
                    : `${getSemesterLabel(selectedSemesterFilter)} (${selectedAcademicYear}) • Điểm khởi tạo ${SEMESTER_BASE_SCORE}/200`}
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-amber-800 bg-amber-100 px-3 py-1 rounded-full">
              {students.length} học sinh
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {rankedStudents.map((item, idx) => {
              const medal =
                idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
              const isTop3 = idx < 3;

              return (
                <div
                  key={item.student.id}
                  onClick={() => onOpenStudentProfile(item.student.id)}
                  className={`p-3.5 sm:p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                    isTop3 ? 'bg-amber-50/20' : ''
                  }`}
                >
                  <div className="flex items-center space-x-3.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                        idx === 0
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : idx === 1
                          ? 'bg-slate-200 text-slate-800 border border-slate-300'
                          : idx === 2
                          ? 'bg-amber-200/60 text-amber-900 border border-amber-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {medal}
                    </div>

                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0 ${
                        item.student.gender === 'Nữ'
                          ? 'bg-gradient-to-tr from-pink-400 to-rose-400'
                          : 'bg-gradient-to-tr from-blue-500 to-teal-400'
                      }`}
                    >
                      {item.student.name.charAt(item.student.name.lastIndexOf(' ') + 1)}
                    </div>

                    <div className="min-w-0">
                      <div className="font-bold text-slate-800 text-sm hover:text-blue-600 transition-colors truncate">
                        {item.student.name}
                      </div>
                      <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-1.5">
                        <span>Tổ {item.student.group}</span>
                        <span>•</span>
                        <span>{item.student.role}</span>
                        <span>•</span>
                        <span className="text-emerald-700 font-medium">+{item.praiseCount} khen</span>
                        <span>•</span>
                        <span className="text-rose-600 font-medium">-{item.reminderCount} nhắc</span>
                      </div>
                    </div>
                  </div>

                  {selectedSemesterFilter === 'ALL' ? (
                    <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                      <div className="px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 text-right">
                        <div className="text-[10px] font-bold text-slate-400">HK I</div>
                        <div className="text-xs font-extrabold font-mono text-slate-800">
                          {item.hk1.totalScore}/200
                          <span className={`ml-1 px-1.5 py-0.2 rounded text-[10px] ${item.hk1.ratingInfo.badgeBg} ${item.hk1.ratingInfo.badgeText}`}>
                            {item.hk1.ratingInfo.rating}
                          </span>
                        </div>
                      </div>
                      <div className="px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 text-right">
                        <div className="text-[10px] font-bold text-slate-400">HK II</div>
                        <div className="text-xs font-extrabold font-mono text-slate-800">
                          {item.hk2.totalScore}/200
                          <span className={`ml-1 px-1.5 py-0.2 rounded text-[10px] ${item.hk2.ratingInfo.badgeBg} ${item.hk2.ratingInfo.badgeText}`}>
                            {item.hk2.ratingInfo.rating}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-right shrink-0 pl-2 flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border ${item.ratingInfo.badgeBg} ${item.ratingInfo.badgeText}`}
                      >
                        {item.ratingInfo.rating}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-xl font-extrabold text-sm font-mono ${
                          item.score >= SEMESTER_BASE_SCORE
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {item.score}/{SEMESTER_BASE_SCORE}đ
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Cột 3: BẢNG XẾP HẠNG TỔ */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 bg-gradient-to-r from-teal-500/10 to-blue-500/10 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-teal-600" />
                <h3 className="font-extrabold text-slate-800 text-sm sm:text-base">
                  THI ĐUA CÁC TỔ
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-medium">4 Tổ thi đua</span>
            </div>

            <div className="p-4 space-y-3">
              {rankedGroups.map((group, idx) => (
                <div
                  key={group.groupNum}
                  className={`p-3.5 rounded-xl border transition-all ${
                    idx === 0
                      ? 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 shadow-xs'
                      : 'bg-slate-50 border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-xs ${
                          idx === 0
                            ? 'bg-amber-500 text-white'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="font-extrabold text-slate-800 text-sm">
                        Tổ {group.groupNum}
                      </span>
                      {idx === 0 && (
                        <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-1.5 py-0.5 rounded">
                          Dẫn đầu
                        </span>
                      )}
                    </div>

                    {selectedSemesterFilter === 'ALL' ? (
                      <div className="text-right text-xs font-mono">
                        <div>HK I TB: <b className="text-slate-900">{group.avgHk1}</b>/200</div>
                        <div>HK II TB: <b className="text-slate-900">{group.avgHk2}</b>/200</div>
                      </div>
                    ) : (
                      <div className="text-right">
                        <span className="font-black text-base text-slate-800 font-mono">
                          {group.avgScore}/200
                        </span>
                        <span className="text-[11px] text-slate-400 block">TB / học sinh</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-200/40">
                    <span>Sĩ số: {group.studentCount} bạn</span>
                    {selectedSemesterFilter !== 'ALL' && (
                      <span>Tổng tổ: <b>{group.totalScore}đ</b></span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Lưu ý sư phạm */}
          <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-2xl text-xs text-blue-900 leading-relaxed">
            <p className="font-bold flex items-center gap-1.5 mb-1 text-blue-800">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              Nguyên tắc điểm học kỳ:
            </p>
            Mỗi học kỳ khởi tạo <b>200 điểm</b> độc lập cho mỗi học sinh. Điểm cộng hoặc trừ ở Học kỳ I không ảnh hưởng sang Học kỳ II, và toàn bộ lịch sử được lưu giữ riêng theo từng năm học, học kỳ.
          </div>
        </div>
      </div>

      {/* Lịch sử ghi nhận thi đua */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
        <h4 className="font-bold text-slate-800 text-sm sm:text-base mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-600" />
          LỊCH SỬ GHI NHẬN THI ĐUA —{' '}
          {selectedSemesterFilter === 'ALL'
            ? `CẢ NĂM ${selectedAcademicYear}`
            : `${getSemesterLabel(selectedSemesterFilter).toUpperCase()} (${selectedAcademicYear})`}{' '}
          ({filteredConduct.length} lượt)
        </h4>

        {filteredConduct.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-4">
            Chưa có lượt ghi nhận nào trong giai đoạn này.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto pr-1">
            {filteredConduct.map((rec) => {
              const student = students.find((s) => s.id === rec.studentId);
              if (!student) return null;
              const recTerm = resolveRecordTerm(rec, yearConfigs, selectedAcademicYear);

              return (
                <div
                  key={rec.id}
                  className="py-3 flex items-center justify-between text-xs hover:bg-slate-50/80 px-2 rounded-lg transition-colors group"
                >
                  <div className="flex items-center space-x-2.5 min-w-0 pr-3">
                    <span className="font-mono text-slate-400 shrink-0">
                      {formatDateVN(rec.date)}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                        recTerm.semester === 'HK1'
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          : 'bg-teal-50 text-teal-700 border border-teal-200'
                      }`}
                    >
                      {recTerm.semester === 'HK1' ? 'HK I' : 'HK II'}
                    </span>
                    <span
                      onClick={() => onOpenStudentProfile(student.id)}
                      className="font-bold text-slate-800 hover:text-blue-600 cursor-pointer shrink-0"
                    >
                      {student.name}
                    </span>
                    <span className="text-slate-400 shrink-0">Tổ {student.group}</span>
                    <span className="text-slate-700 truncate font-medium">
                      {rec.criterionName}
                    </span>
                    {rec.note && (
                      <span className="text-slate-400 italic truncate">({rec.note})</span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <span
                      className={`font-black px-2.5 py-0.5 rounded-lg text-xs font-mono ${
                        rec.points > 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {rec.points > 0 ? `+${rec.points}` : rec.points}
                    </span>
                    {isTeacherLoggedIn && onUpdateConductRecord && (
                      <button
                        type="button"
                        onClick={() => openEditRecordModal(rec)}
                        className="text-slate-400 hover:text-blue-600 p-1 rounded transition-colors cursor-pointer"
                        title="Chỉnh sửa sự việc"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isTeacherLoggedIn && (
                      <button
                        type="button"
                        onClick={() => onDeleteConductRecord(rec.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors cursor-pointer"
                        title="Xóa lượt ghi này nếu ghi nhầm"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL GHI NHẬN THI ĐUA */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 pb-3 border-b border-slate-100 flex items-center gap-2">
              <Award className="w-5 h-5 text-blue-600" />
              Ghi nhận thi đua cho học sinh
            </h3>

            <form onSubmit={handleSubmitRecord} className="mt-4 space-y-4 text-xs">
              {/* Chọn học sinh */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Chọn học sinh *</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} - Tổ {s.group} ({s.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Chọn ngày & tự động xác định học kỳ */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ngày ghi nhận</label>
                <input
                  type="date"
                  required
                  value={recordDate}
                  onChange={(e) => setRecordDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden"
                />
                {recordTermDetection.matched ? (
                  <div className="mt-1.5 flex items-center justify-between text-[11px] bg-indigo-50 text-indigo-800 px-3 py-1.5 rounded-lg border border-indigo-200">
                    <span>Tự động xác định học kỳ:</span>
                    <b>
                      {getSemesterLabel(recordTermDetection.semester)} • {recordTermDetection.academicYear}
                    </b>
                  </div>
                ) : (
                  <div className="mt-2 p-2.5 bg-amber-50 border border-amber-300 rounded-xl space-y-2 text-[11px] text-amber-900">
                    <div className="flex items-start gap-1.5 font-semibold">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        Ngày {formatDateVN(recordDate)} nằm ngoài khoảng thời gian học kỳ đã cấu hình. Vui lòng kiểm tra lại ngày hoặc chọn học kỳ muốn ghi nhận:
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={manualTermYear}
                        onChange={(e) => setManualTermYear(e.target.value)}
                        className="p-1.5 bg-white border border-amber-300 rounded-lg font-semibold"
                      >
                        {availableAcademicYears.map((yr) => (
                          <option key={yr} value={yr}>{yr}</option>
                        ))}
                      </select>
                      <select
                        value={manualTermSemester}
                        onChange={(e) => setManualTermSemester(e.target.value as SemesterKey)}
                        className="p-1.5 bg-white border border-amber-300 rounded-lg font-semibold"
                      >
                        <option value="HK1">Học kỳ I</option>
                        <option value="HK2">Học kỳ II</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Chọn tiêu chí */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tiêu chí thi đua</label>
                <select
                  value={selectedCriterionId}
                  onChange={(e) => handleCriterionChange(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden"
                >
                  <optgroup label="🌟 Tuyên dương (+)">
                    {criteria
                      .filter((c) => c.type === 'praise')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (+{c.points} điểm)
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="⚠️ Nhắc nhở (-)">
                    {criteria
                      .filter((c) => c.type === 'reminder')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.points} điểm)
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>

              {/* Số điểm cộng/trừ */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Số điểm (dương là cộng, âm là trừ)
                </label>
                <input
                  type="number"
                  value={customPoints}
                  onChange={(e) => setCustomPoints(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden font-bold text-sm"
                />
              </div>

              {/* Ghi chú chi tiết */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Ghi chú chi tiết lý do (tùy chọn)
                </label>
                <input
                  type="text"
                  value={recordNote}
                  onChange={(e) => setRecordNote(e.target.value)}
                  placeholder="VD: Tiết học môn Toán, giúp bạn lau bảng..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsRecordModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs cursor-pointer"
                >
                  Lưu ghi nhận
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CHỈNH SỬA SỰ VIỆC THI ĐUA */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-600" />
                Chỉnh sửa sự việc thi đua
              </h3>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedRecord} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ngày xảy ra *</label>
                <input
                  type="date"
                  required
                  value={editDate}
                  onChange={(e) => {
                    const nextDate = e.target.value;
                    setEditDate(nextDate);
                    const detected = detectTermByDate(nextDate, yearConfigs, activeTerm.academicYear);
                    setEditManualYear(detected.academicYear);
                    setEditManualSemester(detected.semester);
                  }}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white"
                />
                {editTermDetection.matched ? (
                  <div className="mt-1.5 flex items-center justify-between text-[11px] bg-indigo-50 text-indigo-800 px-3 py-1.5 rounded-lg border border-indigo-200">
                    <span>Áp dụng cho học kỳ:</span>
                    <b>
                      {getSemesterLabel(editTermDetection.semester)} • {editTermDetection.academicYear}
                    </b>
                  </div>
                ) : (
                  <div className="mt-2 p-2.5 bg-amber-50 border border-amber-300 rounded-xl space-y-2 text-[11px] text-amber-900">
                    <div className="flex items-start gap-1.5 font-semibold">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>Ngày ngoài khoảng cấu hình học kỳ. Chọn học kỳ áp dụng:</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={editManualYear}
                        onChange={(e) => setEditManualYear(e.target.value)}
                        className="p-1.5 bg-white border border-amber-300 rounded-lg font-semibold"
                      >
                        {availableAcademicYears.map((yr) => (
                          <option key={yr} value={yr}>{yr}</option>
                        ))}
                      </select>
                      <select
                        value={editManualSemester}
                        onChange={(e) => setEditManualSemester(e.target.value as SemesterKey)}
                        className="p-1.5 bg-white border border-amber-300 rounded-lg font-semibold"
                      >
                        <option value="HK1">Học kỳ I</option>
                        <option value="HK2">Học kỳ II</option>
                      </select>
                    </div>
                  </div>
                )}
                {isCrossSemesterMove && originalEditTerm && (
                  <div className="mt-1.5 p-2 rounded-lg bg-blue-50 border border-blue-200 text-[11px] text-blue-900 font-semibold">
                    Sự việc chuyển từ {getSemesterLabel(originalEditTerm.semester)} ({originalEditTerm.academicYear}) sang {getSemesterLabel(nextEditSemester)} ({nextEditYear}). Điểm của cả hai học kỳ sẽ được tự động tính lại!
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nội dung sự việc *</label>
                <input
                  type="text"
                  required
                  value={editCriterionName}
                  onChange={(e) => setEditCriterionName(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Số điểm (dương là cộng, âm là trừ) *
                </label>
                <input
                  type="number"
                  required
                  value={editPoints}
                  onChange={(e) => setEditPoints(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white font-bold font-mono text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ghi chú chi tiết</label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-4 py-2 font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs cursor-pointer"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CẤU HÌNH LỊCH HỌC KỲ THEO NĂM HỌC */}
      {isTermConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                Cấu hình thời gian Học kỳ theo Năm học
              </h3>
              <button
                type="button"
                onClick={() => setIsTermConfigModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTermConfigs} className="mt-4 space-y-4 text-xs">
              <p className="text-slate-600 bg-blue-50 border border-blue-200 rounded-xl p-3">
                Hệ thống dựa vào các mốc ngày bên dưới để tự động chuyển sang <b>Học kỳ II (200/200 điểm)</b> và tự động phân loại sự việc vào đúng học kỳ mà không ảnh hưởng dữ liệu học kỳ trước.
              </p>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {draftConfigs.map((cfg, idx) => (
                  <div key={cfg.academicYear} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5">
                    <div className="font-extrabold text-sm text-slate-800">
                      Năm học {cfg.academicYear}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">Bắt đầu HK I</label>
                        <input
                          type="date"
                          value={cfg.hk1Start}
                          onChange={(e) => {
                            const updated = [...draftConfigs];
                            updated[idx] = { ...cfg, hk1Start: e.target.value };
                            setDraftConfigs(updated);
                          }}
                          className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">Kết thúc HK I</label>
                        <input
                          type="date"
                          value={cfg.hk1End}
                          onChange={(e) => {
                            const updated = [...draftConfigs];
                            updated[idx] = { ...cfg, hk1End: e.target.value };
                            setDraftConfigs(updated);
                          }}
                          className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">Bắt đầu HK II</label>
                        <input
                          type="date"
                          value={cfg.hk2Start}
                          onChange={(e) => {
                            const updated = [...draftConfigs];
                            updated[idx] = { ...cfg, hk2Start: e.target.value };
                            setDraftConfigs(updated);
                          }}
                          className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">Kết thúc HK II</label>
                        <input
                          type="date"
                          value={cfg.hk2End}
                          onChange={(e) => {
                            const updated = [...draftConfigs];
                            updated[idx] = { ...cfg, hk2End: e.target.value };
                            setDraftConfigs(updated);
                          }}
                          className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Thêm năm học mới */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newYearInput}
                  onChange={(e) => setNewYearInput(e.target.value)}
                  placeholder="VD: 2028 - 2029"
                  className="px-3 py-2 border border-slate-200 rounded-xl bg-white flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddAcademicYearConfig}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-semibold cursor-pointer"
                >
                  + Thêm năm học
                </button>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTermConfigModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 cursor-pointer"
                >
                  Lưu cấu hình học kỳ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL QUẢN LÝ TIÊU CHÍ */}
      {isCriteriaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-100 my-8">
            <h3 className="text-lg font-bold text-slate-900 pb-3 border-b border-slate-100 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-teal-600" />
              Tùy chỉnh tiêu chí thi đua
            </h3>

            {/* Form thêm tiêu chí mới */}
            <form onSubmit={handleAddCriterion} className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs">
              <div className="font-bold text-slate-800">Thêm tiêu chí mới</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    value={newCritName}
                    onChange={(e) => setNewCritName(e.target.value)}
                    placeholder="Tên tiêu chí (VD: Tham gia phát biểu bài...)"
                    className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                  />
                </div>
                <div>
                  <select
                    value={newCritType}
                    onChange={(e) => setNewCritType(e.target.value as 'praise' | 'reminder')}
                    className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="praise">Tuyên dương (+)</option>
                    <option value="reminder">Nhắc nhở (-)</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span>Điểm:</span>
                  <input
                    type="number"
                    value={newCritPoints}
                    onChange={(e) => setNewCritPoints(Number(e.target.value))}
                    min={1}
                    max={20}
                    className="w-16 p-1.5 rounded-lg border border-slate-200 bg-white text-center font-bold"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold cursor-pointer"
                >
                  + Thêm tiêu chí
                </button>
              </div>
            </form>

            {/* Danh sách tiêu chí hiện có */}
            <div className="mt-5 space-y-2 max-h-72 overflow-y-auto pr-1 text-xs">
              {criteria.map((crit) => (
                <div
                  key={crit.id}
                  className="p-2.5 rounded-xl border border-slate-200 flex items-center justify-between bg-white"
                >
                  <div>
                    <span className="font-bold text-slate-800">{crit.name}</span>
                    <span className="text-[11px] text-slate-400 ml-2">({crit.category})</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`font-bold px-2 py-0.5 rounded text-xs ${
                        crit.type === 'praise' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {crit.points > 0 ? `+${crit.points}` : crit.points}
                    </span>
                    <button
                      onClick={() => handleDeleteCriterion(crit.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                      title="Xóa tiêu chí"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsCriteriaModalOpen(false)}
                className="px-5 py-2 font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer text-xs sm:text-sm"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XUẤT EXCEL THI ĐUA */}
      <ConductExcelExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        students={students}
        conduct={conduct}
        settings={effectiveSettings}
        classNameTitle={classNameTitle}
        isTeacherLoggedIn={isTeacherLoggedIn}
        onShowToast={onShowToast}
      />
    </div>
  );
};
