'use client';
import {useState,type FormEvent} from 'react';
import {ArrowRight} from 'lucide-react';
import s from '../app/home.module.css';

export function PublicContactForm({email,whatsapp}:{email:string;whatsapp:string}){
 const [notice,setNotice]=useState('');
 function prepare(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const fields=new FormData(event.currentTarget);
  const text=`Olá, equipe MedSI!\n\nNome: ${String(fields.get('name')).trim()}\nClínica/consultório: ${String(fields.get('company')).trim()}\nInteresse: ${String(fields.get('interest'))}\n\n${String(fields.get('message')).trim()}`;
  const target=whatsapp?`https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}`:`mailto:${email}?subject=${encodeURIComponent('Contato sobre a MedSI')}&body=${encodeURIComponent(text)}`;
  setNotice('A mensagem foi preparada. Conclua o envio no '+(whatsapp?'WhatsApp.':'seu aplicativo de e-mail.'));
  window.location.assign(target);
 }
 return <form className={s.contactForm} onSubmit={prepare}><label>Seu nome<input name="name" autoComplete="name" required minLength={2} maxLength={100} placeholder="Como podemos chamar você?"/></label><label>Nome da clínica ou consultório<input name="company" autoComplete="organization" required minLength={2} maxLength={120} placeholder="Qual é o seu negócio?"/></label><label>Quero conversar sobre<select name="interest" defaultValue="Marketing e conteúdo"><option>Marketing e conteúdo</option><option>Atendimento e CRM</option><option>Site da clínica</option><option>Parcerias</option><option>Outro assunto</option></select></label><label>Conte um pouco do que precisa<textarea name="message" rows={4} required minLength={10} maxLength={1200} placeholder="Qual desafio você quer resolver na sua clínica?"/></label><p>Os campos preparam sua mensagem no {whatsapp?'WhatsApp':'aplicativo de e-mail'}. O envio só acontece quando você confirmar por lá.</p><button className={s.primary} type="submit">{whatsapp?'Continuar no WhatsApp':'Preparar e-mail'}<ArrowRight size={17}/></button>{notice&&<p role="status" className={s.note}>{notice}</p>}</form>;
}
