const DATE_TIME_REGEX = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::(\d{2}))?)?/;

const splitDateTime = (value) => {
  if (!value) return { date: null, time: null };
  if (value instanceof Date) {
    const iso = value.toISOString();
    return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
  }
  const trimmed = String(value).trim();
  if (!trimmed) return { date: null, time: null };

  const match = trimmed.match(DATE_TIME_REGEX);
  if (!match) return { date: null, time: null };

  const date = match[1];
  const hoursMinutes = match[2];
  const seconds = match[3] || "00";
  const time = hoursMinutes ? `${hoursMinutes}:${seconds}` : null;
  return { date, time };
};

const normalizeTime = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso.slice(11, 19);
  }
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  if (trimmed.includes("T")) {
    const [, timeWithZone = ""] = trimmed.split("T");
    const timePart = timeWithZone.split(/[zZ]|[+-]\d{2}:?\d{2}$/)[0];
    return timePart.split(".")[0] || null;
  }
  if (trimmed.includes(" ")) {
    const [, timeWithZone = ""] = trimmed.split(" ");
    const timePart = timeWithZone.split(/[zZ]|[+-]\d{2}:?\d{2}$/)[0];
    return timePart.split(".")[0] || null;
  }

  const basic = trimmed.match(/^(\d{2}:\d{2})(?::(\d{2}))?$/);
  if (basic) return `${basic[1]}:${basic[2] || "00"}`;

  return null;
};

const resolveEventDateAndStartTime = ({ start_date, start_time, start_date_time }) => {
  if (start_date || start_time) {
    return {
      event_date: start_date || null,
      start_time: start_time ? normalizeTime(start_time) : null
    };
  }

  const { date, time } = splitDateTime(start_date_time);
  return { event_date: date, start_time: time ? normalizeTime(time) : null };
};

module.exports = {
  splitDateTime,
  normalizeTime,
  resolveEventDateAndStartTime
};

