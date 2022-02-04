import axios, { AxiosInstance } from 'axios';
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

  /** PROJECTS */

  /**
   * Request list of user's live projects.
   * @returns {List}
   */
  list = () => this.axios.get<List[]>('/list');

  /**
   * Deploy compressed files to surge for hosting live site.
   * @param {string} domain Domain name where site will be hosted.
   * @param {any} data Compressed site data to be hosted. Must include index.html.
   * @returns {any} Under active development.
   */
  deploy = (domain: string, data: any) => {
    const headers = {
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
}

export default Surge;
