import { detectTags } from "./types.js";
import { previousDiary } from "./sleep.js";
export function reflect({
  text,
  typeTags = [],
  date,
  records = [],
  language = "ja",
}) {
  const tags = typeTags.length ? [...new Set(typeTags)] : detectTags(text);
  const diary = previousDiary(records, date);
  return {
    tags,
    diary,
    analysis: {
      engine: "local",
      language,
      diaryDate: diary?.date || null,
      title: String(text).slice(0, 40),
      summary: String(text),
      reply: "",
      mental_state_hint: "",
    },
    sharedThemes: diary
      ? detectTags(diary.text).filter((id) => tags.includes(id))
      : [],
  };
}
