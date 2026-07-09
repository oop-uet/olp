const ROMAN_SEMESTERS: Record<number, string> = {
  1: "I",
  2: "II",
  3: "III",
};

function normalizeRomanSemester(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (trimmed === "1") return "I";
  if (trimmed === "2") return "II";
  if (trimmed === "3") return "III";
  if (trimmed === "I" || trimmed === "II" || trimmed === "III") return trimmed;
  return trimmed;
}

export function getSemesterCompactPrefix(semester: string): string {
  if (!semester) return "";

  const canonicalMatch = semester.match(/^(\d{4})-(\d{4})-HK([123])$/i);
  if (canonicalMatch) {
    const startYear = canonicalMatch[1].slice(2);
    const endYear = canonicalMatch[2].slice(2);
    const semesterNumber = Number(canonicalMatch[3]);
    return `${ROMAN_SEMESTERS[semesterNumber] ?? canonicalMatch[3]}${startYear}${endYear}`;
  }

  const readableMatch = semester.match(
    /h[oọ]c\s*k[yỳì]\s*(I{1,3}|[123])(?:\s*n[aă]m\s*h[oọ]c)?\s*(\d{4})\s*[-–]\s*(\d{4})/i
  );
  if (readableMatch) {
    const hk = normalizeRomanSemester(readableMatch[1]);
    return `${hk}${readableMatch[2].slice(2)}${readableMatch[3].slice(2)}`;
  }

  return "";
}

export function stripSemesterCompactPrefix(sectionName: string): string {
  return sectionName.trim().replace(/^(?:I|II|III)\d{4}\s+/i, "").trim();
}

export function normalizeSectionNameForSemester(sectionName: string, semester: string): string {
  const trimmedName = sectionName.trim().replace(/\s+/g, " ");
  const prefix = getSemesterCompactPrefix(semester);
  
  let baseName = stripSemesterCompactPrefix(trimmedName);
  if (!baseName) return prefix || trimmedName;
  
  if (!/[A-Z]{3,4}\s*\d{4}/i.test(baseName)) {
    baseName = `INT2204 ${baseName}`;
  }

  if (!prefix) return baseName;
  return `${prefix} ${baseName}`;
}
