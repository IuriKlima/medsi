import type { Metadata } from 'next';
import './globals.css';
import './brand.css';
export const metadata: Metadata = { title: 'MedSI — Sua clínica em sintonia', description: 'Marketing e atendimento com IA para médicos e clínicas. Da primeira conversa ao próximo agendamento, com a equipe no controle.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
