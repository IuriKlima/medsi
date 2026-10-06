import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,URL} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const security='Se você não reconhece esta alteração, acesse a MedSI pelo endereço oficial e use “Esqueci minha senha” para recuperar seu acesso.';
export const accountEmails=[
 {key:'confirmation',subject:'Confirme seu e-mail para entrar na MedSI',label:'BOAS-VINDAS',title:'Seu próximo passo começa aqui.',intro:'Confirme seu e-mail para acessar a MedSI e começar a organizar o marketing e o atendimento da sua clínica.',button:'Confirmar meu e-mail',note:'Se você não criou esta conta, pode ignorar esta mensagem. Nenhuma assinatura é contratada ao confirmar seu cadastro.'},
 {key:'recovery',subject:'Redefina sua senha da MedSI',label:'RECUPERAR ACESSO',title:'Vamos recuperar seu acesso.',intro:'Recebemos uma solicitação para redefinir a senha da sua conta. Use o botão abaixo para escolher uma nova senha.',button:'Criar nova senha',note:'Se você não solicitou esta alteração, ignore este e-mail. Sua senha atual permanece a mesma.'},
 {key:'invite',subject:'Você recebeu um convite para a MedSI',label:'CONVITE',title:'Um novo espaço para colaborar.',intro:'Você recebeu um convite para criar seu acesso à MedSI. Confirme o convite para continuar.',button:'Aceitar convite',note:'Se você não esperava este convite, ignore a mensagem. Seus acessos serão definidos pelas permissões concedidas à sua conta.'},
 {key:'magic_link',subject:'Seu link de acesso à MedSI',label:'ACESSO À CONTA',title:'Seu espaço está a um passo.',intro:'Use o botão abaixo para acessar sua conta na MedSI. Este link é pessoal e pode ser usado uma única vez.',button:'Entrar na MedSI',note:'Não compartilhe este link. Se você não solicitou acesso, ignore esta mensagem.'},
 {key:'email_change',subject:'Confirme a alteração do seu e-mail na MedSI',label:'ALTERAÇÃO DE E-MAIL',title:'Vamos confirmar seu novo e-mail.',intro:'Recebemos uma solicitação para usar <strong>{{ .NewEmail }}</strong> como e-mail da sua conta. Confirme a alteração abaixo.',button:'Confirmar alteração',note:'Se você não solicitou a alteração, não confirme. Acesse a MedSI pelo endereço oficial para verificar sua conta.'},
 {key:'reauthentication',subject:'Seu código de verificação da MedSI',label:'VERIFICAÇÃO DE SEGURANÇA',title:'Uma confirmação para continuar.',intro:'Digite o código abaixo na MedSI para confirmar sua identidade e continuar a operação solicitada.',code:true,note:'Não compartilhe este código com ninguém. Se você não iniciou esta operação, ignore a mensagem.'},
 {key:'password_changed_notification',subject:'A senha da sua conta MedSI foi alterada',label:'SEGURANÇA DA CONTA',title:'Sua senha foi alterada.',intro:'A senha de acesso à sua conta MedSI foi alterada. Se foi você, nenhuma ação adicional é necessária.',notification:'password_changed',note:security},
 {key:'email_changed_notification',subject:'O e-mail da sua conta MedSI foi alterado',label:'SEGURANÇA DA CONTA',title:'Seu e-mail foi atualizado.',intro:'O e-mail da sua conta foi alterado de <strong>{{ .OldEmail }}</strong> para <strong>{{ .Email }}</strong>.',notification:'email_changed',note:security},
 {key:'phone_changed_notification',subject:'O telefone da sua conta MedSI foi alterado',label:'SEGURANÇA DA CONTA',title:'Seu telefone foi atualizado.',intro:'O número de telefone associado à sua conta MedSI foi alterado. Se foi você, nenhuma ação adicional é necessária.',notification:'phone_changed',note:security},
 {key:'identity_linked_notification',subject:'Novo método de acesso vinculado à MedSI',label:'SEGURANÇA DA CONTA',title:'Um novo método de acesso.',intro:'Um método de acesso foi vinculado à sua conta MedSI: <strong>{{ .Provider }}</strong>.',notification:'identity_linked',note:security},
 {key:'identity_unlinked_notification',subject:'Método de acesso removido da MedSI',label:'SEGURANÇA DA CONTA',title:'Um método de acesso foi removido.',intro:'O método de acesso <strong>{{ .Provider }}</strong> foi removido da sua conta MedSI.',notification:'identity_unlinked',note:security},
 {key:'mfa_factor_enrolled_notification',subject:'Verificação adicional ativada na sua conta MedSI',label:'SEGURANÇA DA CONTA',title:'Mais proteção para seu acesso.',intro:'Um método de verificação adicional foi cadastrado na sua conta MedSI. Se foi você, nenhuma ação adicional é necessária.',notification:'mfa_factor_enrolled',note:security},
 {key:'mfa_factor_unenrolled_notification',subject:'Verificação adicional removida da sua conta MedSI',label:'SEGURANÇA DA CONTA',title:'Uma verificação foi removida.',intro:'Um método de verificação adicional foi removido da sua conta MedSI.',notification:'mfa_factor_unenrolled',note:security},
];
export function renderAccountEmail(email){
 const cta=email.button?{text:email.button,href:'{{ .ConfirmationURL }}'}:email.notification?{text:'Verificar minha conta',href:'{{ .SiteURL }}/login'}:null;
 return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${email.subject}</title>
<style>@media only screen and (max-width:600px){.outer{padding:24px 12px!important}.content{padding:28px 22px!important}.title{font-size:27px!important}.button{display:block!important;text-align:center!important}}</style></head>
<body style="margin:0;padding:0;background-color:#f5f7f4;color:#123d46;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<div style="display:none;font-size:1px;line-height:1px;color:#f5f7f4;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${email.subject}. Uma mensagem sobre sua conta.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f7f4;"><tr><td class="outer" align="center" style="padding:48px 20px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
<tr><td style="padding:0 8px 26px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="38" height="38" align="center" bgcolor="#123d46" style="border-radius:11px;color:#ffffff;font-size:31px;font-weight:600;line-height:38px;">M</td><td style="padding-left:11px;font-size:30px;line-height:38px;font-weight:700;letter-spacing:-1.6px;color:#123d46;">Med<span style="color:#42d6b0">SI</span></td></tr></table></td></tr>
<tr><td class="content" bgcolor="#ffffff" style="padding:42px;border:1px solid #e8e9ed;border-radius:20px;">
<p style="margin:0 0 18px;color:#506c70;font-size:11px;line-height:18px;letter-spacing:1.8px;font-weight:600;">${email.label}</p>
<h1 class="title" style="margin:0 0 24px;font-size:32px;font-weight:600;letter-spacing:-1px;line-height:1.2;color:#123d46;">${email.title}</h1>
<p style="margin:0 0 12px;font-size:16px;line-height:26px;color:#414650;">Olá,</p>
<p style="margin:0 0 28px;font-size:16px;line-height:26px;color:#414650;">${email.intro}</p>
${email.code?'<p style="margin:0 0 28px;padding:20px;border:1px solid #e8e9ed;border-radius:12px;background-color:#f5f7f4;text-align:center;font-family:monospace;font-size:32px;line-height:40px;letter-spacing:8px;color:#123d46;">{{ .Token }}</p>':''}
${cta?`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;"><tr><td bgcolor="#123d46" style="border-radius:10px;mso-padding-alt:16px 24px;"><a class="button" href="${cta.href}" style="display:inline-block;padding:16px 24px;border:1px solid #123d46;border-radius:10px;color:#ffffff;text-decoration:none;font-size:15px;line-height:20px;font-weight:600;">${cta.text}</a></td></tr></table>`:''}
<p style="margin:0;padding-top:24px;border-top:1px solid #e8e9ed;font-size:13px;line-height:21px;color:#506c70;">${email.note}</p>
${email.button?'<p style="margin:20px 0 0;font-size:12px;line-height:20px;color:#506c70;">Se o botão não abrir, copie e cole este endereço no navegador:<br><a href="{{ .ConfirmationURL }}" style="color:#414650;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">{{ .ConfirmationURL }}</a></p>':''}
</td></tr>
<tr><td align="center" style="padding:26px 18px 0;color:#506c70;font-size:12px;line-height:20px;"><p style="margin:0 0 6px;font-weight:600;color:#414650;">MedSI · Sua clínica em sintonia.</p><p style="margin:0 0 10px;">Você recebeu este aviso por uma ação relacionada à sua conta.</p><a href="{{ .SiteURL }}" style="color:#506c70;text-decoration:underline;">Acessar MedSI</a></td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>
`;
}
export function buildAccountEmails(){
 const directory=resolve(root,'supabase/templates');mkdirSync(directory,{recursive:true});const patch={};
 for(const email of accountEmails){const html=renderAccountEmail(email);writeFileSync(resolve(directory,email.key+'.html'),html);patch['mailer_subjects_'+email.key]=email.subject;patch['mailer_templates_'+email.key+'_content']=html;if(email.notification)patch['mailer_notifications_'+email.notification+'_enabled']=true;}
 writeFileSync(resolve(directory,'auth-config.json'),JSON.stringify(patch,null,2)+'\n');
 return {count:accountEmails.length,directory};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.stdout.write(JSON.stringify(buildAccountEmails())+'\n');
