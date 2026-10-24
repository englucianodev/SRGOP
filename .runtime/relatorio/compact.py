from lxml import etree as E
from zipfile import ZipFile
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
with ZipFile(r'D:/Downloads/Template – Proposta Tecnológica (1).docx') as z:
 root=E.fromstring(z.read('word/document.xml')); ps=root.findall('w:body/w:p',ns)
 for i,p in enumerate(ps):
  if p.findall('.//w:sectPr',ns) or p.findall('.//w:br',ns): print('BREAK',i,E.tostring(p).decode()[-800:])
 styles=E.fromstring(z.read('word/styles.xml'))
 for s in styles:
  if s.get('{'+ns['w']+'}styleId') in ['Heading1','Title'] or s.tag.endswith('docDefaults'): print(E.tostring(s).decode())
 print('header',z.read('word/header1.xml').decode())
