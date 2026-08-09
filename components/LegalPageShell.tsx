import Link from "next/link";
import Logo from "./Logo";

export default function LegalPageShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-canvas">
      <header className="max-w-2xl mx-auto px-6 py-8 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={20} className="text-primary" />
          <span className="text-sm font-display font-bold text-primary tracking-tight">SONIQ</span>
        </Link>
        <Link href="/" className="text-xs text-secondary hover:text-primary transition-colors">
          Back to home
        </Link>
      </header>

      <article className="max-w-2xl mx-auto px-6 pb-24">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-primary tracking-tight mb-2">{title}</h1>
        <p className="text-xs text-tertiary mb-10">Last updated {updated}</p>
        <div className="prose-legal space-y-6 text-sm text-secondary leading-relaxed">
          {children}
        </div>
      </article>
    </main>
  );
}
