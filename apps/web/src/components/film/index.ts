/**
 * film/: the cinematic scroll kit.
 *
 * Built for the home page, meant to be reused by any marketing page that
 * needs the same one-scene-per-idea storytelling: drop a <FilmScene> with a
 * photo, put a <FilmCopy> inside it, and add one device.
 *
 * Remember to render <FilmStyles /> once per page and to wrap the scenes in
 * a container with the "film" class.
 */

export { FilmScene, useFilmScene } from "./FilmScene";
export type { FilmSceneProps } from "./FilmScene";

export { FilmCopy } from "./FilmCopy";
export type { FilmCopyProps } from "./FilmCopy";

export { AiAnswer } from "./AiAnswer";
export type { AiAnswerProps, AnswerSegment, AnswerTone } from "./AiAnswer";

export { EngineScan } from "./EngineScan";
export type { EngineScanProps, EngineRow } from "./EngineScan";

export { WorkChecklist } from "./WorkChecklist";
export type { WorkChecklistProps, WorkItem } from "./WorkChecklist";

export { FilmStartForm } from "./FilmStartForm";

export { FilmStyles, FilmProgressBar } from "./FilmChrome";

export {
  useScrollFilm,
  useScrollProgress,
  clamp,
  ease,
  prefersReducedMotion,
} from "./useScrollFilm";
export type { ScrollFilmRefs } from "./useScrollFilm";
