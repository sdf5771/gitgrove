export interface FileEntry { p: string; s: 'M' | 'A' | 'D'; a: number; d: number }
export interface CommitLabel { text: string; type: 'head' | 'branch' | 'hotfix' | 'remote' | 'tag' }
export interface Commit {
  id: string; lane: number; msg: string; author: string; time: string
  parents: number[]; labels: CommitLabel[]
  stats: { f: number; a: number; d: number }; files: FileEntry[]
  _q?: string
}
export interface Branch { name: string; lane: number; current?: boolean; ahead?: number; behind?: number }
export interface DiffLine { t: 'hunk' | 'ctx' | 'add' | 'del'; s: string }
export interface Stash { idx: number; msg: string; branch: string; files: number; time: string }
export interface Repo { id: string; name: string; path: string; branch: string; dirty: boolean; ahead: number; behind: number }
export interface RecentRepo { name: string; path: string; lastOpened: string }
export interface Command { id: string; label: string; icon: string; cat: string; kbd: string; desc: string }
export interface BlameLine { n: number; hash: string; au: string; ac: string; t: string; c: string }
export interface PullRequest {
  id: number; title: string; author: string; initials: string; ac: string
  from: string; to: string; status: 'open' | 'merged' | 'closed'
  created: string; comments: number; additions: number; deletions: number; labels: string[]
  body: string
  reviewers: Array<{ i: string; ac: string; status: string }>
  checks: Array<{ name: string; s: 'pass' | 'fail' | 'pend' }>
  files: FileEntry[]
  threads: Array<{ id: number; author: string; i: string; ac: string; time: string; file: string | null; line: number | null; body: string }>
}
export interface ConflictFile {
  path: string; resolved: boolean
  conflicts: Array<{ id: string; resolved: boolean; choice: string | null; ours: string[]; theirs: string[] }>
}

export const COMMITS: Commit[] = [
  {id:'a1b2c3d',lane:0,msg:"Merge branch 'feature/auth' into main",author:'Sarah Kim',time:'2m ago',parents:[1,4],labels:[{text:'HEAD → main',type:'head'}],stats:{f:3,a:124,d:18},files:[{p:'src/auth/oauth.ts',s:'M',a:87,d:12},{p:'src/auth/jwt.ts',s:'M',a:31,d:6},{p:'package.json',s:'M',a:6,d:0}]},
  {id:'b2c3d4e',lane:0,msg:'Update CI/CD deployment scripts',author:'Alex Chen',time:'1h ago',parents:[2],labels:[],stats:{f:2,a:35,d:12},files:[{p:'.github/workflows/deploy.yml',s:'M',a:23,d:8},{p:'Dockerfile',s:'M',a:12,d:4}]},
  {id:'c3d4e5f',lane:0,msg:'Add Prometheus monitoring endpoints',author:'Sarah Kim',time:'3h ago',parents:[3],labels:[],stats:{f:2,a:95,d:2},files:[{p:'src/metrics/index.ts',s:'A',a:89,d:0},{p:'src/app.module.ts',s:'M',a:6,d:2}]},
  {id:'d4e5f6g',lane:0,msg:'Fix race condition in request queue',author:'Mike Lee',time:'5h ago',parents:[5],labels:[],stats:{f:1,a:23,d:8},files:[{p:'src/queue/processor.ts',s:'M',a:23,d:8}]},
  {id:'e5f6g7h',lane:1,msg:'Add OAuth2 token refresh rotation',author:'James Park',time:'4h ago',parents:[6],labels:[{text:'feature/auth',type:'branch'}],stats:{f:3,a:187,d:0},files:[{p:'src/auth/oauth.ts',s:'M',a:87,d:12},{p:'src/auth/tokens.ts',s:'A',a:64,d:0},{p:'src/auth/refresh.ts',s:'A',a:36,d:0}]},
  {id:'f6g7h8i',lane:0,msg:'Bump version to 1.2.0',author:'Alex Chen',time:'8h ago',parents:[7],labels:[],stats:{f:2,a:6,d:6},files:[{p:'package.json',s:'M',a:3,d:3},{p:'CHANGELOG.md',s:'M',a:3,d:3}]},
  {id:'g7h8i9j',lane:1,msg:'Implement JWT expiry validation',author:'James Park',time:'10h ago',parents:[7],labels:[],stats:{f:2,a:67,d:14},files:[{p:'src/auth/jwt.ts',s:'M',a:45,d:8},{p:'src/auth/guards.ts',s:'M',a:22,d:6}]},
  {id:'h8i9j0k',lane:0,msg:"Merge branch 'hotfix/login-fix'",author:'Mike Lee',time:'12h ago',parents:[8,9],labels:[],stats:{f:1,a:12,d:3},files:[{p:'src/auth/session.ts',s:'M',a:12,d:3}]},
  {id:'i9j0k1l',lane:0,msg:'Add API rate limiting middleware',author:'Sarah Kim',time:'1d ago',parents:[10],labels:[],stats:{f:2,a:75,d:2},files:[{p:'src/middleware/rate-limit.ts',s:'A',a:67,d:0},{p:'src/app.module.ts',s:'M',a:8,d:2}]},
  {id:'j0k1l2m',lane:2,msg:'Fix null pointer in session handler',author:'Mike Lee',time:'13h ago',parents:[10],labels:[{text:'hotfix/login-fix',type:'hotfix'}],stats:{f:1,a:8,d:2},files:[{p:'src/auth/session.ts',s:'M',a:8,d:2}]},
  {id:'k1l2m3n',lane:0,msg:"Merge branch 'feature/ui-redesign'",author:'Sarah Kim',time:'2d ago',parents:[11,12],labels:[],stats:{f:8,a:342,d:156},files:[{p:'src/components/Button.tsx',s:'M',a:82,d:34},{p:'src/components/Modal.tsx',s:'M',a:124,d:67},{p:'src/styles/theme.css',s:'M',a:136,d:55}]},
  {id:'l2m3n4o',lane:0,msg:'Update OpenAPI documentation',author:'Alex Chen',time:'2d ago',parents:[15],labels:[],stats:{f:2,a:272,d:93},files:[{p:'docs/api.yaml',s:'M',a:228,d:81},{p:'README.md',s:'M',a:44,d:12}]},
  {id:'m3n4o5p',lane:3,msg:'Complete new component library',author:'Liu Yang',time:'1d ago',parents:[13],labels:[{text:'feature/ui-redesign',type:'branch'}],stats:{f:6,a:521,d:89},files:[{p:'src/components/Button.tsx',s:'M',a:82,d:34},{p:'src/components/Input.tsx',s:'A',a:145,d:0},{p:'src/components/Modal.tsx',s:'A',a:294,d:55}]},
  {id:'n4o5p6q',lane:3,msg:'Add dark mode CSS variables',author:'Liu Yang',time:'3d ago',parents:[14],labels:[],stats:{f:3,a:183,d:44},files:[{p:'src/styles/theme.css',s:'M',a:183,d:44}]},
  {id:'o5p6q7r',lane:3,msg:'Redesign navigation and sidebar',author:'Liu Yang',time:'4d ago',parents:[15],labels:[],stats:{f:4,a:412,d:267},files:[{p:'src/layouts/AppShell.tsx',s:'M',a:412,d:267}]},
  {id:'p6q7r8s',lane:0,msg:'Initial project setup',author:'Sarah Kim',time:'1wk ago',parents:[],labels:[{text:'origin/main',type:'remote'},{text:'v1.0.0',type:'tag'}],stats:{f:15,a:892,d:0},files:[{p:'.',s:'A',a:892,d:0}]},
]

export const LOCAL_BRANCHES: Branch[] = [
  {name:'main',lane:0,current:true,ahead:2,behind:0},
  {name:'feature/auth',lane:1},
  {name:'feature/ui-redesign',lane:3},
  {name:'hotfix/login-fix',lane:2},
]
export const REMOTE_BRANCHES = [{name:'origin/main'},{name:'origin/feature/auth'}]
export const TAGS = [{name:'v1.0.0'},{name:'v0.9.2'}]

export const INIT_STASHES: Stash[] = [
  {idx:0,msg:'WIP: auth refactor — token refresh',branch:'feature/auth',files:3,time:'35m ago'},
  {idx:1,msg:'stash@{1}: WIP on main: bump deps',branch:'main',files:2,time:'2h ago'},
]

export const DIFF: DiffLine[] = [
  {t:'hunk',s:"@@ -18,8 +18,16 @@ import { Injectable } from '@nestjs/common';"},
  {t:'ctx',s:' '},{t:'ctx',s:' @Injectable()'},{t:'ctx',s:' export class JwtService {'},
  {t:'ctx',s:'   constructor('},{t:'del',s:'-    private readonly config: JwtConfig,'},{t:'add',s:'+    private readonly config: JwtConfig,'},{t:'add',s:'+    private readonly logger: Logger,'},
  {t:'ctx',s:'   ) {}'},{t:'ctx',s:' '},{t:'ctx',s:'   async validateToken(token: string): Promise<JwtPayload> {'},
  {t:'del',s:'-    const payload = this.verifyToken(token);'},{t:'del',s:'-    return payload;'},
  {t:'add',s:"+    const payload = await this.verifyToken(token);"},{t:'add',s:"+    if (payload.exp && payload.exp < Date.now() / 1000) {"},
  {t:'add',s:"+      this.logger.warn('Token expired', { exp: payload.exp });"},{t:'add',s:"+      throw new TokenExpiredError('Token has expired');"},
  {t:'add',s:'+    }'},{t:'add',s:'+    return { ...payload, verified: true };'},{t:'ctx',s:'   }'},{t:'ctx',s:' }'},
]

export const DIFF_FULL: Record<string, { a: number; d: number; lines: DiffLine[] }> = {
  'src/auth/jwt.ts':{a:31,d:6,lines:[
    {t:'hunk',s:"@@ -1,5 +1,7 @@"},
    {t:'ctx',s:" import { Injectable } from '@nestjs/common';"},{t:'add',s:"+import { Logger } from '@nestjs/common';"},
    {t:'ctx',s:" import { JwtConfig, JwtPayload } from './types';"},{t:'add',s:"+import { TokenExpiredError } from './errors';"},
    {t:'ctx',s:' '},{t:'hunk',s:"@@ -18,12 +20,22 @@ export class JwtService {"},
    {t:'ctx',s:' @Injectable()'},{t:'ctx',s:' export class JwtService {'},
    {t:'ctx',s:'   constructor('},{t:'del',s:'-    private readonly config: JwtConfig,'},{t:'add',s:'+    private readonly config: JwtConfig,'},{t:'add',s:'+    private readonly logger: Logger,'},
    {t:'ctx',s:'   ) {}'},{t:'ctx',s:' '},{t:'ctx',s:'   async validateToken(token: string): Promise<JwtPayload> {'},
    {t:'del',s:'-    const payload = this.verifyToken(token);'},{t:'del',s:'-    return payload;'},
    {t:'add',s:"+    const payload = await this.verifyToken(token);"},{t:'add',s:"+    if (payload.exp && payload.exp < Date.now() / 1000) {"},
    {t:'add',s:"+      this.logger.warn('Token expired', { exp: payload.exp });"},{t:'add',s:"+      throw new TokenExpiredError('Token has expired');"},
    {t:'add',s:'+    }'},{t:'add',s:'+    return { ...payload, verified: true };'},
    {t:'ctx',s:'   }'},{t:'ctx',s:'   '},{t:'ctx',s:'   private verifyToken(token: string): JwtPayload {'},{t:'ctx',s:"     return this.jwtService.verify(token, this.config);"},{t:'ctx',s:'   }'},{t:'ctx',s:' }'},
  ]},
  'src/auth/oauth.ts':{a:87,d:12,lines:[
    {t:'hunk',s:"@@ -1,8 +1,12 @@"},
    {t:'ctx',s:" import { Injectable } from '@nestjs/common';"},{t:'ctx',s:" import { HttpService } from '@nestjs/axios';"},
    {t:'add',s:"+import { ConfigService } from '@nestjs/config';"},{t:'add',s:"+import { firstValueFrom } from 'rxjs';"},
    {t:'ctx',s:" import { OAuthToken } from './types';"},{t:'ctx',s:' '},
    {t:'hunk',s:"@@ -24,14 +28,30 @@ export class OAuthService {"},
    {t:'ctx',s:' @Injectable()'},{t:'ctx',s:' export class OAuthService {'},
    {t:'ctx',s:'   constructor('},{t:'del',s:'-    private readonly http: HttpService,'},{t:'add',s:'+    private readonly http: HttpService,'},{t:'add',s:'+    private readonly config: ConfigService,'},
    {t:'ctx',s:'   ) {}'},{t:'ctx',s:' '},
    {t:'del',s:'-  async refreshToken(token: string): Promise<OAuthToken> {'},{t:'del',s:"-    const res = await this.http.post('/oauth/token', {token}).toPromise();"},{t:'del',s:'-    return res.data;'},{t:'del',s:'-  }'},
    {t:'add',s:'+  async refreshToken(refreshToken: string): Promise<OAuthToken> {'},{t:'add',s:"+    const url = this.config.get('OAUTH_TOKEN_URL');"},{t:'add',s:"+    const res = await firstValueFrom(this.http.post(url, {grant_type:'refresh_token',refresh_token:refreshToken}));"},{t:'add',s:'+    return res.data;'},{t:'add',s:'+  }'},
    {t:'ctx',s:' }'},
  ]},
}

export const BLAME_LINES: BlameLine[] = [
  {n:1,hash:'p6q7r8s',au:'SK',ac:'#e6a536',t:'1wk',c:"import { Injectable } from '@nestjs/common';"},
  {n:2,hash:'g7h8i9j',au:'JP',ac:'#5fb8e6',t:'10h',c:"import { Logger } from '@nestjs/common';"},
  {n:3,hash:'p6q7r8s',au:'SK',ac:'#e6a536',t:'1wk',c:"import { JwtConfig, JwtPayload } from './types';"},
  {n:4,hash:'a1b2c3d',au:'SK',ac:'#e6a536',t:'2m', c:"import { TokenExpiredError } from './errors';"},
  {n:5,hash:'p6q7r8s',au:'SK',ac:'#e6a536',t:'1wk',c:''},
  {n:6,hash:'p6q7r8s',au:'SK',ac:'#e6a536',t:'1wk',c:'@Injectable()'},
  {n:7,hash:'p6q7r8s',au:'SK',ac:'#e6a536',t:'1wk',c:'export class JwtService {'},
  {n:8,hash:'p6q7r8s',au:'SK',ac:'#e6a536',t:'1wk',c:'  constructor('},
  {n:9,hash:'g7h8i9j',au:'JP',ac:'#5fb8e6',t:'10h',c:'    private readonly config: JwtConfig,'},
  {n:10,hash:'a1b2c3d',au:'SK',ac:'#e6a536',t:'2m', c:'    private readonly logger: Logger,'},
  {n:11,hash:'p6q7r8s',au:'SK',ac:'#e6a536',t:'1wk',c:'  ) {}'},
  {n:12,hash:'p6q7r8s',au:'SK',ac:'#e6a536',t:'1wk',c:''},
  {n:13,hash:'g7h8i9j',au:'JP',ac:'#5fb8e6',t:'10h',c:'  async validateToken(token: string): Promise<JwtPayload> {'},
  {n:14,hash:'a1b2c3d',au:'SK',ac:'#e6a536',t:'2m', c:'    const payload = await this.verifyToken(token);'},
  {n:15,hash:'a1b2c3d',au:'SK',ac:'#e6a536',t:'2m', c:"    if (payload.exp && payload.exp < Date.now() / 1000) {"},
  {n:16,hash:'a1b2c3d',au:'SK',ac:'#e6a536',t:'2m', c:"      this.logger.warn('Token expired', { exp: payload.exp });"},
  {n:17,hash:'a1b2c3d',au:'SK',ac:'#e6a536',t:'2m', c:"      throw new TokenExpiredError('Token has expired');"},
  {n:18,hash:'a1b2c3d',au:'SK',ac:'#e6a536',t:'2m', c:'    }'},
  {n:19,hash:'a1b2c3d',au:'SK',ac:'#e6a536',t:'2m', c:'    return { ...payload, verified: true };'},
  {n:20,hash:'p6q7r8s',au:'SK',ac:'#e6a536',t:'1wk',c:'  }'},
  {n:21,hash:'g7h8i9j',au:'JP',ac:'#5fb8e6',t:'10h',c:''},
  {n:22,hash:'g7h8i9j',au:'JP',ac:'#5fb8e6',t:'10h',c:'  private verifyToken(token: string): JwtPayload {'},
  {n:23,hash:'p6q7r8s',au:'SK',ac:'#e6a536',t:'1wk',c:'    return this.jwtService.verify(token, this.config);'},
  {n:24,hash:'p6q7r8s',au:'SK',ac:'#e6a536',t:'1wk',c:'  }'},
  {n:25,hash:'p6q7r8s',au:'SK',ac:'#e6a536',t:'1wk',c:'}'},
]

export const COMMANDS: Command[] = [
  {id:'pull',label:'Pull',icon:'↓',cat:'Git',kbd:'⌘⇧P',desc:'Pull from remote'},
  {id:'push',label:'Push',icon:'↑',cat:'Git',kbd:'⌘P',desc:'Push to remote'},
  {id:'fetch',label:'Fetch',icon:'⟳',cat:'Git',kbd:'⌘⇧F',desc:'Fetch all remotes'},
  {id:'merge',label:'Merge / Rebase…',icon:'⎇',cat:'Git',kbd:'⌘M',desc:'Merge or rebase branches'},
  {id:'stash',label:'Stash Changes',icon:'⧉',cat:'Git',kbd:'⌘⇧S',desc:'Save current work in progress'},
  {id:'cherry',label:'Cherry-pick…',icon:'✦',cat:'Git',kbd:'',desc:'Apply a commit to this branch'},
  {id:'rebase',label:'Interactive Rebase…',icon:'⇄',cat:'Git',kbd:'⌘⇧R',desc:'Reorder and edit recent commits'},
  {id:'branch-new',label:'New Branch…',icon:'+',cat:'Branch',kbd:'⌘⇧B',desc:'Create a new local branch'},
  {id:'branch-rename',label:'Rename Branch…',icon:'✎',cat:'Branch',kbd:'',desc:'Rename a local branch'},
  {id:'branch-delete',label:'Delete Branch…',icon:'×',cat:'Branch',kbd:'',desc:'Delete a local branch'},
  {id:'view-history',label:'History',icon:'①',cat:'View',kbd:'⌘1',desc:'Show commit history graph'},
  {id:'view-stage',label:'Stage',icon:'②',cat:'View',kbd:'⌘2',desc:'Stage and commit changes'},
  {id:'view-diff',label:'Diff Explorer',icon:'③',cat:'View',kbd:'⌘3',desc:'Browse file diffs side-by-side'},
  {id:'view-blame',label:'Git Blame',icon:'④',cat:'View',kbd:'⌘⇧L',desc:'Show blame for current file'},
  {id:'settings',label:'Settings…',icon:'⚙',cat:'App',kbd:'⌘,',desc:'Open application preferences'},
]

export const REPOS: Repo[] = [
  {id:'main',name:'gitgrove-project',path:'~/dev/gitgrove-project',branch:'main',dirty:true,ahead:2,behind:0},
  {id:'api',name:'gitgrove-api',path:'~/dev/gitgrove-api',branch:'develop',dirty:false,ahead:0,behind:3},
]
export const RECENT_REPOS: RecentRepo[] = [
  {name:'gitgrove-project',path:'~/dev/gitgrove-project',lastOpened:'2m ago'},
  {name:'gitgrove-api',path:'~/dev/gitgrove-api',lastOpened:'1h ago'},
  {name:'frontend-app',path:'~/projects/frontend-app',lastOpened:'3d ago'},
  {name:'design-system',path:'~/projects/design-system',lastOpened:'1wk ago'},
]

export const PR_DATA: PullRequest[] = [
  {
    id:42,title:'Add OAuth2 token refresh with automatic rotation',
    author:'James Park',initials:'JP',ac:'#5fb8e6',
    from:'feature/auth',to:'main',status:'open',
    created:'2h ago',comments:3,additions:187,deletions:0,labels:['feature','auth'],
    body:'Implements automatic token refresh rotation. The new `TokenRefreshService` handles expiry detection and transparently reissues tokens before they expire.\n\n## Changes\n- Added `TokenRefreshService` with rotation logic\n- JWT validation now checks expiry window (5min buffer)\n- Added unit tests for edge cases',
    reviewers:[{i:'SK',ac:'#e6a536',status:'approved'},{i:'AC',ac:'#c39ad9',status:'pending'}],
    checks:[{name:'CI / Build',s:'pass'},{name:'CI / Tests',s:'pass'},{name:'CI / Lint',s:'pass'},{name:'Security Scan',s:'pend'}],
    files:[{p:'src/auth/tokens.ts',s:'A',a:64,d:0},{p:'src/auth/refresh.ts',s:'A',a:36,d:0},{p:'src/auth/oauth.ts',s:'M',a:87,d:0}],
    threads:[
      {id:1,author:'Sarah Kim',i:'SK',ac:'#e6a536',time:'1h ago',file:'src/auth/refresh.ts',line:42,body:'LGTM! The rotation logic looks solid. Should we also handle expired refresh tokens explicitly?'},
      {id:2,author:'Alex Chen',i:'AC',ac:'#c39ad9',time:'45m ago',file:null,line:null,body:'Good catch @SK — @JP could you add a test case for that edge case?'},
    ]
  },
  {
    id:41,title:'Update CI/CD pipeline — migrate to GitHub Actions v4',
    author:'Alex Chen',initials:'AC',ac:'#c39ad9',
    from:'chore/ci-update',to:'main',status:'open',
    created:'5h ago',comments:1,additions:35,deletions:12,labels:['chore','ci'],
    body:"Updates the deployment pipeline to use GitHub Actions v4 runners and Node.js 20 LTS.\n\nThis resolves the deprecation warnings we've been seeing on every push.",
    reviewers:[{i:'SK',ac:'#e6a536',status:'pending'}],
    checks:[{name:'CI / Build',s:'pass'},{name:'CI / Tests',s:'pass'},{name:'CI / Lint',s:'fail'}],
    files:[{p:'.github/workflows/deploy.yml',s:'M',a:23,d:8},{p:'Dockerfile',s:'M',a:12,d:4}],
    threads:[]
  },
  {
    id:40,title:'Merge feature/ui-redesign — new component library',
    author:'Liu Yang',initials:'LY',ac:'#6fcf7c',
    from:'feature/ui-redesign',to:'main',status:'merged',
    created:'2d ago',comments:7,additions:521,deletions:89,labels:['feature','ui'],
    body:'Complete overhaul of the component library with dark mode support, new Input and Modal components.',
    reviewers:[{i:'SK',ac:'#e6a536',status:'approved'},{i:'ML',ac:'#ff6b6b',status:'approved'}],
    checks:[{name:'CI / Build',s:'pass'},{name:'CI / Tests',s:'pass'},{name:'CI / Lint',s:'pass'}],
    files:[{p:'src/components/Button.tsx',s:'M',a:82,d:34},{p:'src/components/Input.tsx',s:'A',a:145,d:0},{p:'src/components/Modal.tsx',s:'A',a:294,d:55}],
    threads:[]
  },
]

export const CONFLICT_FILES: ConflictFile[] = [
  {
    path:'src/auth/session.ts',resolved:false,
    conflicts:[{
      id:'c1',resolved:false,choice:null,
      ours:['  async createSession(userId: string): Promise<Session> {','    const token = this.generateToken();','    return { userId, token, expiresAt: Date.now() + 3600000 };','  }'],
      theirs:['  async createSession(userId: string, opts?: SessionOptions): Promise<Session> {','    const token = await this.tokenService.generate(userId);','    const ttl = opts?.ttl ?? this.config.defaultTtl;','    return { userId, token, expiresAt: Date.now() + ttl };','  }'],
    }]
  },
  {
    path:'src/auth/guards.ts',resolved:false,
    conflicts:[{
      id:'c2',resolved:false,choice:null,
      ours:['  canActivate(ctx: ExecutionContext): boolean {','    const req = ctx.switchToHttp().getRequest();',"    const token = req.headers['authorization'];"],
      theirs:['  async canActivate(ctx: ExecutionContext): Promise<boolean> {','    const req = ctx.switchToHttp().getRequest();','    const token = this.extractToken(req);'],
    }]
  },
  {
    path:'package.json',resolved:false,
    conflicts:[{
      id:'c3',resolved:false,choice:null,
      ours:['  "version": "1.1.9",'],
      theirs:['  "version": "1.2.0",'],
    }]
  },
]

// 브랜치 레인 색. 레인 인덱스를 LANE_COLORS.length로 modulo해 순환 적용한다
// (CommitGraph). 복잡한 그래프에서 색 반복을 줄이려 8색으로 확장(앞 4색은 기존 유지).
export const LANE_COLORS = [
  '#e6a536', // 0 gold
  '#5fb8e6', // 1 blue
  '#ff6b6b', // 2 red
  '#c39ad9', // 3 purple
  '#6fcf7c', // 4 green
  '#4ecdc4', // 5 teal
  '#f78fb3', // 6 pink
  '#ffa94d', // 7 orange
]
export const BRANCH_LANES: Record<string, number> = {'main':0,'feature/auth':1,'hotfix/login-fix':2,'feature/ui-redesign':3}
