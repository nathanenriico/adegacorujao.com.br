-- ============================================================
-- MIGRAÇÃO: suporte a fotos no painel admin
-- Execute no SQL Editor do Supabase
-- ============================================================

-- 1. Adicionar coluna foto_url na tabela produtos
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- 2. Adicionar coluna fotos_urls (array de URLs) para múltiplas fotos
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS fotos_urls TEXT[];

-- 3. Criar bucket público para as fotos (execute no Dashboard > Storage)
INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos', 'fotos', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Política de acesso público para leitura das fotos
CREATE POLICY "Fotos públicas" ON storage.objects
  FOR SELECT USING (bucket_id = 'fotos');

-- 5. Política para upload (anon pode enviar)
CREATE POLICY "Upload de fotos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'fotos');

-- 6. Política para deletar fotos
CREATE POLICY "Deletar fotos" ON storage.objects
  FOR DELETE USING (bucket_id = 'fotos');

-- ============================================================
-- MIGRAÇÃO: corrigir FK para permitir exclusão de produtos
-- Execute no SQL Editor do Supabase
-- ============================================================

-- vendas
ALTER TABLE vendas DROP CONSTRAINT IF EXISTS vendas_produto_id_fkey;
ALTER TABLE vendas ADD CONSTRAINT vendas_produto_id_fkey
  FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL;

-- itens_venda
ALTER TABLE itens_venda DROP CONSTRAINT IF EXISTS itens_venda_produto_id_fkey;
ALTER TABLE itens_venda ADD CONSTRAINT itens_venda_produto_id_fkey
  FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL;

-- gastos
ALTER TABLE gastos DROP CONSTRAINT IF EXISTS gastos_produto_id_fkey;
ALTER TABLE gastos ADD CONSTRAINT gastos_produto_id_fkey
  FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL;

-- movimentacoes_estoque
ALTER TABLE movimentacoes_estoque DROP CONSTRAINT IF EXISTS movimentacoes_estoque_produto_id_fkey;
ALTER TABLE movimentacoes_estoque ADD CONSTRAINT movimentacoes_estoque_produto_id_fkey
  FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL;
