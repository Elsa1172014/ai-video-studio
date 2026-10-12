from .wan import WanAdapter
from .ltx import LTXAdapter
from .avatar import AvatarAdapter
from .lipsync import LipSyncAdapter
from .hf_space import HFSpaceAdapter
from .auto import AutoAdapter
ADAPTERS={"wan":WanAdapter(),"ltx":LTXAdapter(),"hf":HFSpaceAdapter(),"avatar":AvatarAdapter(),"lipsync":LipSyncAdapter()}
ADAPTERS["auto"]=AutoAdapter(ADAPTERS)
