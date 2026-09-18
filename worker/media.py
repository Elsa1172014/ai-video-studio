import uuid,shutil
from fastapi import UploadFile
from storage import OUTPUT_DIR,public_url
async def save_upload(file:UploadFile):
 suffix='.'+(file.filename.rsplit('.',1)[-1] if file.filename and '.' in file.filename else 'bin');path=OUTPUT_DIR/f'{uuid.uuid4()}{suffix}'
 with path.open('wb') as out:shutil.copyfileobj(file.file,out)
 return {'id':path.stem,'name':file.filename,'url':public_url(path)}
