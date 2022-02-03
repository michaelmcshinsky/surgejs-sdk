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
    this.options = options;
    this.axios = this.configure(options);
  }

  /**
   *
   * @param {Object} options - Configuration object for the API
   */
  configure(options: Options) {
    return axios.create({
      baseURL: baseUrl,
      headers,
      auth: { ...options },
    });
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
  account = () => this.axios.post<Account>('/account');

  /**
   * Request stats about user's usage on surge services.
   * @returns {Stat} Stat information about user's usage
   */
  stats = () => this.axios.post<Stats>('/stats');

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
