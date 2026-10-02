export function Loading({ label = 'Loading…' }: { label?: string }) { return <div className="state loading" role="status">{label}</div>; }
export function EmptyState({ title, detail }: { title: string; detail?: string }) { return <div className="state empty"><h2>{title}</h2>{detail && <p>{detail}</p>}</div>; }
export function ErrorMessage({ message }: { message: string }) { return <div className="state error" role="alert">{message}</div>; }
