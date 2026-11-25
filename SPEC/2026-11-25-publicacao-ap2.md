# Publicação da AP2 no Render

Data: 2026-11-25. O Blueprint usa a branch main do fork mayaracunha-beep/dsai-ap2-eduquest e configura serviço web e PostgreSQL exclusivos da AP2. O serviço usa o Dockerfile do projeto e as migrações aplicadas na inicialização. O banco aceita conexões pela rede privada do Render.

O deploy não executa o seed de desenvolvimento. O seed também recusa execução quando NODE_ENV for production, antes de alterar contas. A importação dos cursos usa uma conta de professor já provisionada nesse ambiente.

A validação online consulta /api/v1/health, identifica o SHA do deploy no Render e confirma o catálogo, as apostilas e as avaliações a partir do ambiente publicado.
