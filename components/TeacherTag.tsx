/* Ярлык «Учитель» рядом с именем — в группах, расписании и админке. */
export default function TeacherTag({ label = 'Учитель' }: { label?: string }) {
  return <span className="t-tag">{label}</span>;
}

/** Имя учителя с ярлыком. */
export function TeacherName({ name }: { name: string }) {
  return <span className="t-name">{name}<TeacherTag /></span>;
}
