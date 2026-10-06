type AccountCompany={id:string;created_at?:string;archived_at?:string|null};

// Legacy accounts retain all records; the oldest active clinic is their default.
export function customerEntryDestination(companies:readonly AccountCompany[],metaError=false){
 const company=companies.filter(c=>!c.archived_at).sort((a,b)=>(a.created_at??'').localeCompare(b.created_at??'')||a.id.localeCompare(b.id))[0];
 if(!company)return '/comecar';
 return '/empresa/'+company.id+(metaError?'/configuracoes?aba=integracoes&meta_error=1':'');
}
export function invitationFromHash(hash:string){
 const token=new URLSearchParams(hash.replace(/^#/, '')).get('invite');
 return token&&/^[a-f0-9]{64}$/.test(token)?token:null;
}
export function legacyAccountDestination(search:string){
 const params=new URLSearchParams(search),company=params.get('companyId'),view=params.get('view');
 if(!company||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(company))return '/entrada';
 if(view==='import')return '/empresa/'+company+'/conteudo';
 const tab=view==='team'||view==='security'?'equipe':view==='plan'?'assinatura':null;
 return '/empresa/'+company+(tab?'/configuracoes?aba='+tab:'');
}
