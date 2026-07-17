export interface TimecodeProps {
  /** ISO 字符串或 Date；非法输入渲染为空 */
  date: string | Date;
  /** true 时输出 [MM·DD HH:MM]，否则 [HH:MM] */
  withDate?: boolean;
  className?: string;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 统一时间码格式化：`[HH:MM]` 或 `[MM·DD HH:MM]`；非法输入返回 null。 */
export function formatTimecode(date: string | Date, withDate = false): string | null {
  const parsed = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return null;
  const time = `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
  if (!withDate) return `[${time}]`;
  return `[${pad2(parsed.getMonth() + 1)}·${pad2(parsed.getDate())} ${time}]`;
}

function joinClasses(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/** 时间码锚点：等宽 10px 暗绿（className 可覆盖），机器文案豁免 i18n。 */
export function Timecode({ date, withDate = false, className }: TimecodeProps) {
  const parsed = typeof date === 'string' ? new Date(date) : date;
  const text = formatTimecode(parsed, withDate);
  if (text === null) return null;
  return (
    <time
      dateTime={parsed.toISOString()}
      className={joinClasses(
        'whitespace-nowrap font-mono text-[10px] tracking-[0.15em] text-[#3A5A3A]',
        className,
      )}
    >
      {text}
    </time>
  );
}
