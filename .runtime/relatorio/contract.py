from pathlib import Path
import hashlib
f=Path(r'D:/Downloads/Template – Proposta Tecnológica (1).docx')
Path('.runtime/relatorio/artifact.md').write_text('''# Contrato do template
Referência: D:/Downloads/Template – Proposta Tecnológica (1).docx
SHA256: '''+hashlib.sha256(f.read_bytes()).hexdigest()+'''
Inventário integral de partes: inventory.json. Evidência XML: audit.txt.
Duas seções A4 retrato, 11906 x 16838 twips. Margens superior/esquerda 1701 twips; inferior/direita 1134; cabeçalho/rodapé 708. Primeira seção sem numeração visível; segunda com header1 e campo PAGE.
Arial 12 nas funções principais. Corpo justificado, entrelinha 1,5; títulos Arial 12 negrito, preto. Capa e folha de rosto centralizadas; nota de apresentação com recuo à esquerda. Referências à esquerda, espaçamento simples.
Slots: word/document.xml body p[0:70] capa, folha e sumário; p[71:288] oito seções e referências, instruções e vazios a substituir. A tabela de cronograma será clonada e preenchida em semanas relativas. Preservar ordem das oito seções. Desdobrar a proposta em subseções de usuários, requisitos, viabilidade e validação.
Conteúdo excedente pode clonar os padrões de parágrafo e ocupar páginas adicionais. Remover instruções e vazios do modelo; quebras de página explícitas substituem o espaçamento vazio. Títulos e listas vêm dos padrões existentes. Sem imagens novas.
Partes preservadas byte a byte: todas exceto document.xml e settings.xml. Manter relações, estilos, numbering, fontes, customXML, media, cabeçalho. Ajustar início da numeração para 4 conforme três páginas preliminares. Campo de sumário e PAGE devem atualizar ao abrir Word.
Verificação visual do modelo bloqueada: render_docx.py falhou por ausência de soffice.exe; nenhuma versão LibreOffice empacotada disponível no runtime Windows. Não usar LibreOffice pessoal. Inspeção estrutural integral disponível, paginação visual pendente. Comunicar limite ao usuário.
''',encoding='utf-8')
