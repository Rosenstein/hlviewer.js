type ConfigPaths = {
  base: string
  replays: string
  maps: string
  wads: string
  skies: string
  sounds: string
}

export class Config {
  public static init(params: any): Config {
    if (typeof params === 'string') {
      return new Config({
        paths: {
          base: params,
          replays: `${params}/replays`,
          maps: `${params}/maps`,
          wads: `${params}/wads`,
          skies: `${params}/skies`,
          sounds: `${params}/sounds`
        }
      })
    }

    return new Config({
      paths: {
        base: (params?.paths?.base) || '',
        replays: (params?.paths?.replays) || '/replays',
        maps: (params?.paths?.maps) || '/maps',
        wads: (params?.paths?.wads) || '/wads',
        skies: (params?.paths?.skies) || '/skies',
        sounds: (params?.paths?.sounds) || '/sounds'
      }
    })
  }

  private paths: ConfigPaths

  constructor(params: { paths: ConfigPaths }) {
    this.paths = { ...params.paths }
  }

  getBasePath() {
    return this.paths.base
  }
  getReplaysPath() {
    return this.paths.replays
  }
  getMapsPath() {
    return this.paths.maps
  }
  getWadsPath() {
    return this.paths.wads
  }
  getSkiesPath() {
    return this.paths.skies
  }
  getSoundsPath() {
    return this.paths.sounds
  }
}
