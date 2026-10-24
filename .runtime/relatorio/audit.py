from zipfile import ZipFile
from lxml import etree as E
from docx import Document
from pathlib import Path
import hashlib,json
f=Path(r'D:/Downloads/Template – Proposta Tecnológica (1).docx'); d=Document(f)
for i in [0,2,4,15,27,28,29,30,38,41,43,55,56,70,71,73,101,156,160,168,257,271]:
 p=d.paragraphs[i]; print(i,E.tostring(p._p,pretty_print=True).decode())
print('STYLE',d.styles['normal'].element.xml)
with ZipFile(f) as z:
 Path('.runtime/relatorio/inventory.json').write_text(json.dumps({n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()},indent=2))
 print('PARTS',z.namelist())
 print('SECTIONS',[s._sectPr.xml for s in d.sections])
