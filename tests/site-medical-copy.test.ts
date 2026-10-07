import {describe,expect,it} from 'vitest';
import {renderSite,type SiteContent} from '../packages/contracts/src/site';

const clinic:SiteContent={name:'Clínica Aurora fictícia',headline:'Cardiologia com atenção',intro:'Atendimento administrativo',about:'Equipe e estrutura confirmadas',services:[{title:'Cardiologia',description:'Serviço confirmado'}],address:'Rua Exemplo, 123',hours:'Segunda a sexta',offer:'',whatsapp:'',cta:'Fale com a equipe',color:'#235e66',background:'light',images:[],logo:null};

describe('Medical site section headings',()=>{
 it('renders a legacy clinic draft without fitness copy when headings are absent',()=>{
  const html=renderSite(clinic,()=> '');
  expect(html).toContain('<h2>Conheça nossa clínica.</h2>');
  expect(html).toContain('<h2>Serviços e especialidades.</h2>');
  expect(html).toContain('<h2>Fale com nossa equipe.</h2>');
  expect(html).not.toMatch(/seu movimento|próximo treino/i);
 });
 it('preserves the clinic’s confirmed custom headings',()=>{
  const headings={about:'Nossa equipe',services:'Especialidades da Aurora',offer:'Condições confirmadas',contact:'Converse com a Aurora'};
  const html=renderSite({...clinic,offer:'Consulte nossa equipe',sectionHeadings:headings},()=> '');
  for(const heading of Object.values(headings))expect(html).toContain('<h2>'+heading+'</h2>');
 });
});
