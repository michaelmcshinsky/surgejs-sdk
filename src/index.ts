import axios, { AxiosInstance, AxiosRequestHeaders } from 'axios';
import { baseUrl, headers } from './utils';

export class Surge {
  options: Options;
  axios: AxiosInstance;

  /**
   *
   * @param {Object} options - Configuration object for the API
   */
  constructor(options: Options) {
    this.options = options || {};
    this.axios = axios.create({
      baseURL: baseUrl,
      headers,
      auth: { ...this.options },
    });
  }

  /**
   *
   * @param {Object} options - Configuration object for the API
   */
  init(options: Options) {
    this.options = options || {};
    if (this.options.username && this.options.password) {
      if (!this.axios.defaults.auth) {
        this.axios.defaults.auth = {
          username: this.options.username,
          password: this.options.password,
        };
      } else {
        this.axios.defaults.auth.username = this.options.username;
        this.axios.defaults.auth.password = this.options.password;
      }
    }
  }

  /** AUTHENTICATION */

  /**
   *
   * @param {string} username Name of user's email address.
   * @param {string} password Password created with Surge services.
   * @returns {Login}
   */
  login = (username: string, password: string) => {
    if (username && password) {
      this.init({ username, password });
      return axios.post<Login>(
        `${baseUrl}/token`,
        {},
        {
          headers,
          auth: {
            username,
            password,
          },
        }
      );
    } else {
      return this.axios.post('/token');
    }
  };

  /**
   * Remove user details from the surge instance configuration.
   */
  logout = () => {
    this.options = { username: '', password: '' };
    if (this.axios.defaults.auth) {
      this.axios.defaults.auth.username = '';
      this.axios.defaults.auth.password = '';
    }
  };

  /**
   * Request intitiation of password reset for a given user.
   * @param {string} email Email of user to send reset instructions.
   * @returns {void}
   */
  resetPassword = (email: string) =>
    this.axios.post<void>(`/token/reset/${email}`);

  /** ACCOUNT */

  /**
   * Request user account information.
   * @returns {Account} Account information about the user
   */
  account = () => this.axios.get<Account>('/account');

  /**
   * Request stats about user's usage on surge services.
   * @returns {Stat} Stat information about user's usage
   */
  stats = () => this.axios.get<Stats>('/stats');

  cancel = () => this.axios.delete('/account');

  /** PROJECTS */

  /**
   * Request list of user's live projects.
   * @returns {List}
   */
  list = () => this.axios.get<List[]>('/list');

  /** TODO: data object, return object */
  inviteCollaborators = (domain: string, data: any) => this.axios.post<any>(`/${domain}/collaborators`, data)

  /** TODO: list interface combo users and domain, return object */
  revokeCollaborators = (domain: string, emails: string[]) => this.axios.delete<any>(`/${domain}/collaborators`, { data: emails })

  /** TODO: return object */
  cacheBust = (domain: string) => this.axios.delete<any>(`/${domain}/cache`)

  /** TODO: return object */
  certs = (domain: string) => this.axios.get<any>(`/${domain}/certs`)
  
  /** TODO: return object */
  dns = (domain: string) => this.axios.get<any>(`/${domain}/dns`)

  /** TODO: data, return object */
  dnsAdd = (domain: string, data:any) => this.axios.post<any>(`/${domain}/dns`, { data })

  /** TODO: data, return object */
  dnsRemove = (domain: string, id: string | number) => this.axios.delete<any>(`/${domain}/dns/${id}`)

  /** TODO: return object */
  zone = (domain: string) => this.axios.get<any>(`/${domain}/zone`)

  /** TODO: return object */
  zoneAdd = (domain: string, data: any) => this.axios.get<any>(`/${domain}/zone`, { data })
  
  /** TODO: data, return object */
  zoneRemove = (domain: string, id: string | number) => this.axios.delete<any>(`/${domain}/zone/${id}`)

  /**
   * Update settings for a submitted domain.
   * @param domain Domain to submit updated information for.
   * @param data TDB
   * @returns {Settings}
   */
  settings = (domain: string, data: any) => this.axios.put<Settings>(`/${domain}/settings`, { data })

  /**
   * Analytics details for a user's domain.
   * @param domain Domain to request usage for.
   * @returns {Analytics}
   */
  analytics = (domain: string) => this.axios.get<Analytics>(`/${domain}/analytics`)

  /**
   * Usage (Analytics) details for a user's domain.
   * @param domain Domain to request usage for.
   * @returns {Analytics}
   */
  usage = (domain: string) => this.axios.get<Analytics>(`/${domain}/usage`)

  /**
   * Audit details for a user's domain.
   * @param domain Domain to request usage for.
   * @returns {Usage} Return current revision, manifest, and certification details.
   */
  audit = (domain: string) => this.axios.get<Usage[]>(`/${domain}/audit`)

  /**
   * Deploy compressed files to surge for hosting live site.
   * @param {string} domain Domain name where site will be hosted.
   * @param {any} data Compressed site data to be hosted. Must include index.html.
   * @returns {any} Under active development.
   */
  deploy = (domain: string, data: any) => {
    const headers : AxiosRequestHeaders = {
      version: '',
      'file-count': '',
      cmd: '',
      'project-size': '',
      timestamp: new Date().toJSON(0),
    };
    return this.axios.put<any>(`/${domain}`, data, { headers });
  };

  /**
   * Remove site and domain from surge services.
   * @param {string} domain Name of user's domain to be removed.
   * @returns {Teardown}
   */
  teardown = (domain: string) => this.axios.delete<Teardown>(`/${domain}`);

  /** SURGE */

  /**
   * Returns a list of Surge plans to choose from.
   * @param domain Optional domain to get plan information about.
   * @returns {Plans}
   */
   plans = (domain: string) => {
    const resource = domain ? `/${domain}/plans` : 'plans';
    return this.axios.get<Plans>(resource);
  };
}

export default Surge;
