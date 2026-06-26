-- =========================================================
-- Auditoria Interna SSMA · Usina Santa Adélia
-- Schema completo v5 — rode UMA VEZ no SQL Editor do Supabase
-- =========================================================

create extension if not exists pgcrypto;

-- =========================================================
-- TABELAS
-- =========================================================

-- Unidades (JB, PB, etc.)
create table if not exists unidades (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  sigla text not null,
  created_at timestamptz not null default now()
);

-- Diretorias (entre Unidade e Área)
create table if not exists diretorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  unidade_id uuid references unidades(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Turnos de trabalho
create table if not exists turnos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  horario_inicio text default '',
  horario_fim text default '',
  unidade_id uuid references unidades(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Áreas auditadas
create table if not exists areas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  unidade_id uuid references unidades(id) on delete cascade,
  diretoria_id uuid references diretorias(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Colaboradores (auditores e auditados)
create table if not exists colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  matricula text,
  telefone text default '',
  unidade_id uuid references unidades(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists colaboradores_matricula_uidx
  on colaboradores(matricula)
  where matricula is not null and matricula <> '';

-- Configurações do sistema (pesos do cálculo, WhatsApp SSMA, etc.)
create table if not exists configuracoes (
  chave text primary key,
  valor text not null,
  descricao text default ''
);

-- Formulários / templates de checklist
create table if not exists formularios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text default '',
  ativo boolean not null default true,
  opcoes_resposta jsonb,            -- opções configuráveis por formulário
  created_at timestamptz not null default now()
);

-- Itens de cada formulário
create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  formulario_id uuid not null references formularios(id) on delete cascade,
  categoria text not null,
  texto text not null,
  ordem int not null default 0,
  ativo boolean not null default true
);
create index if not exists checklist_items_formulario_idx on checklist_items(formulario_id);

-- Sequência atômica para código AUD-XX-AAAA-NNN
create table if not exists audit_sequencias (
  unidade_sigla text not null,
  ano int not null,
  ultimo_seq int not null default 0,
  primary key (unidade_sigla, ano)
);

create or replace function get_next_audit_seq(p_sigla text, p_ano int)
returns int language plpgsql security definer as $$
declare v_seq int;
begin
  insert into audit_sequencias(unidade_sigla, ano, ultimo_seq)
  values (p_sigla, p_ano, 1)
  on conflict (unidade_sigla, ano)
  do update set ultimo_seq = audit_sequencias.ultimo_seq + 1
  returning ultimo_seq into v_seq;
  return v_seq;
end;
$$;

-- Auditorias
create table if not exists audits (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  token_gestor text,                -- link único para o gestor propor prazos
  formulario_id uuid references formularios(id) on delete set null,
  formulario_nome text not null default '',
  unidade_id uuid references unidades(id) on delete set null,
  unidade_nome text not null default '',
  unidade_sigla text not null default '',
  area_id uuid references areas(id) on delete set null,
  area_nome text not null default '',
  diretoria_id uuid references diretorias(id) on delete set null,
  diretoria_nome text not null default '',
  turno_id uuid references turnos(id) on delete set null,
  turno_nome text not null default '',
  data date not null,
  auditores jsonb not null default '[]',
  auditados jsonb not null default '[]',
  observacao_geral text default '',
  total_conforme int not null default 0,
  total_nc int not null default 0,
  total_om int not null default 0,
  total_na int not null default 0,
  pontos_possiveis int not null default 0,
  resultado numeric(6,2) not null default 0,
  classificacao text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists audits_token_uidx on audits(token_gestor) where token_gestor is not null;
create index if not exists audits_data_idx on audits(data desc);
create index if not exists audits_area_idx on audits(area_id);
create index if not exists audits_unidade_idx on audits(unidade_id);

-- Itens respondidos em cada auditoria
create table if not exists audit_itens (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references audits(id) on delete cascade,
  checklist_item_id uuid references checklist_items(id) on delete set null,
  checklist_item_texto text not null default '',
  checklist_item_categoria text not null default '',
  -- resposta (texto livre — suporta opções customizadas)
  status text,
  observacao text default '',
  evidencia_url text,
  -- plano de ação (SSMA preenche ação e responsável)
  plano_acao_acao text default '',
  plano_acao_responsavel text default '',
  plano_acao_prazo date,
  plano_acao_status text default 'pendente'
    check (plano_acao_status in ('pendente','em_andamento','concluido')),
  -- negociação de prazo com o gestor
  plano_acao_prazo_gestor date,
  plano_acao_comentario_gestor text default '',
  plano_acao_status_negociacao text default 'aguardando_gestor'
    check (plano_acao_status_negociacao in ('aguardando_gestor','gestor_proposto','ssma_aprovou','ssma_negociou'))
);
create index if not exists audit_itens_audit_idx on audit_itens(audit_id);
create index if not exists audit_itens_status_idx on audit_itens(status);
create index if not exists audit_itens_plano_idx on audit_itens(plano_acao_status);

-- =========================================================
-- ROW LEVEL SECURITY — acesso aberto por link compartilhado
-- =========================================================
alter table unidades enable row level security;
alter table diretorias enable row level security;
alter table turnos enable row level security;
alter table areas enable row level security;
alter table colaboradores enable row level security;
alter table configuracoes enable row level security;
alter table formularios enable row level security;
alter table checklist_items enable row level security;
alter table audit_sequencias enable row level security;
alter table audits enable row level security;
alter table audit_itens enable row level security;

create policy "unidades_all"      on unidades      for all using (true) with check (true);
create policy "diretorias_all"    on diretorias    for all using (true) with check (true);
create policy "turnos_all"        on turnos        for all using (true) with check (true);
create policy "areas_all"         on areas         for all using (true) with check (true);
create policy "colaboradores_all" on colaboradores for all using (true) with check (true);
create policy "configuracoes_all" on configuracoes for all using (true) with check (true);
create policy "formularios_all"   on formularios   for all using (true) with check (true);
create policy "checklist_all"     on checklist_items for all using (true) with check (true);
create policy "sequencias_all"    on audit_sequencias for all using (true) with check (true);
create policy "audits_all"        on audits        for all using (true) with check (true);
create policy "audit_itens_all"   on audit_itens   for all using (true) with check (true);

-- =========================================================
-- STORAGE — fotos de evidência
-- =========================================================
insert into storage.buckets(id, name, public)
values ('evidencias', 'evidencias', true)
on conflict(id) do nothing;

do $$ begin
  create policy "evidencias_select" on storage.objects for select using (bucket_id = 'evidencias');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "evidencias_insert" on storage.objects for insert with check (bucket_id = 'evidencias');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "evidencias_update" on storage.objects for update using (bucket_id = 'evidencias');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "evidencias_delete" on storage.objects for delete using (bucket_id = 'evidencias');
exception when duplicate_object then null; end $$;

-- =========================================================
-- DADOS PADRÃO
-- =========================================================
insert into configuracoes (chave, valor, descricao) values
  ('peso_conforme', '1',   'Pontuação para Conforme'),
  ('peso_om',       '0.5', 'Pontuação para Oportunidade de Melhoria'),
  ('peso_nc',       '-1',  'Pontuação para Não Conforme'),
  ('whatsapp_ssma', '',    'Número WhatsApp da equipe SSMA (ex: 5516999990000)')
on conflict (chave) do nothing;
