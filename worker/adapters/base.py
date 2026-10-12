from abc import ABC,abstractmethod
class NotConfigured(RuntimeError):
 """The provider is installed but has no configuration; an automatic chain skips it silently."""
class VideoAdapter(ABC):
 @abstractmethod
 async def generate(self,prompt:str,duration:int,image_url:str|None=None)->str: ...
