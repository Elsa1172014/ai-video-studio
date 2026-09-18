from abc import ABC,abstractmethod
class VideoAdapter(ABC):
 @abstractmethod
 async def generate(self,prompt:str,duration:int,image_url:str|None=None)->str: ...
