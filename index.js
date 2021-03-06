#! /usr/bin/env node
//jshint node: true
(function () {
  "use strict";
  var GitHubApi = require("github"),
      async     = require('async'),
      program   = require('commander'),
      config    = require("./config.json"),
      github;

  github = new GitHubApi({
    // required
    debug: false,
    version: "3.0.0"
  });
  function ucfirst(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function auth() {
    github.authenticate({
      type: "oauth",
      token: config.token
    });
  }
  function getContributors(user) {
    github.repos.getFromOrg({org: user, 'per_page': 100}, function (errGet, repos) {
      if (errGet) {
        console.error(`Error getting repos for ${user}` + user, errGet);
      } else {
        repos = repos.filter(function (repo) {
          return !repo.private && !repo.fork;
        });
        async.map(repos, function (repo, cb) {
          github.repos.getContributors({ user: user, repo: repo.name, 'per_page': 100 }, function (errContrib, contribs) {
            if (errContrib) {
              console.error(`Error getting contributors for ${user}/${repo.name}`, errContrib);
            } else {
              console.log("# " + repo.name);
              contribs.map(function (contrib) {
                console.log(" - " + contrib.login + " : " + contrib.contributions);
              });
            }
            cb(errContrib, contribs);
          });
        }, function (errMap, contributors) {
          var res = {}, users = [];
          if (errMap) {
            console.error(errMap);
          } else {
            contributors.map(function (repo) {
              repo.map(function (contrib) {
                if (typeof res[contrib.login] === 'undefined') {
                  res[contrib.login] = 0;
                }
                res[contrib.login] += contrib.contributions;
              });
            });
            Object.keys(res).forEach(function (contrib) {
              users.push({name: contrib, value: res[contrib]});
            });
            users.sort(function (a, b) {
              if (a.value > b.value) {
                return -1;
              } else if (a.value < b.value) {
                return 1;
              } else {
                return 0;
              }
            });
            console.log("\n\n# Results");
            users.map(function (contrib) {
              console.log(" - " + contrib.name + " : " + contrib.value);
            });
          }
        });
      }
    });
  }

  function getCommits(user, repo, since, version, dev) {
    var branch = dev ? 'development' : 'master';
    github.repos.getCommits({user: user, repo: repo, per_page: 100, since: since, sha: branch}, function (errCommits, commits) {
      var authors = {},
          merge   = new RegExp('^merge', 'i');
      if (errCommits) {
        console.error(`Error getting commits from ${user}/${repo}/${branch} since ${since}: `, errCommits);
      } else if (!Array.isArray(commits)) {
        console.warn(`No commits in ${user}/${repo}/${branch} since ${since}`);
      } else {
        // remove merge, builds…
        commits = commits.filter(function (commit) {
          var message = commit.commit.message.trim();
          return !merge.test(message) && !/^buil[d|t]$/.test(message) && !/^\d+\.\d+\.\d+/i.test(message);
        });
        if (commits.length > 0) {
          console.log("\n");
          console.log('    h3 ' + ucfirst(repo.replace(/^cozy-/, '')) + " (" + version + ")");
          console.log('    ul');
          commits.reverse().forEach(function (commit) {
            var message;
            message = ucfirst(commit.commit.message.trim());
            message = message.replace(/\n\n/g, "\n").replace(/\n/g, "\n            ");
            message = message.replace(/#(\d+)/g, `<a href="https://github.com/${user}/${repo}/issues/$1" target="_blank">#$1</a>`);
            console.log('        li ' + message);
            authors[commit.author.login] = {};
          });
          console.log('        li.contributors Contributors: ' + Object.keys(authors).map(function (a) {return ucfirst(a);}).sort().join(", "));
          console.log("\n");
        } else {
          console.log(`Nothing new in ${user}/${repo}/${branch} since ${since}`);
        }
      }
    });
  }

  function displayRepo(user, repo, since) {
    var version = '?';
    github.repos.getContent({user: user, repo: repo, path: 'package.json'}, function (errVersion, manifest) {
      if (errVersion) {
        console.error(`Error getting version for ${user}/${repo}`, errVersion);
      } else {
        try {
          version = JSON.parse(new Buffer(manifest.content, manifest.encoding).toString()).version;
        } catch (e) {}
      }
      getCommits(user, repo, since, version, false);
    });
  }

  function compareBranches(user, repo) {
    github.repos.getBranch({user: user, repo: repo, branch: 'master'}, function (errMaster, master) {
      if (errMaster) {
        console.error(`Error getting master branch for ${user}/${repo}`, errMaster);
      } else {
        github.repos.getBranch({user: user, repo: repo, branch: 'development'}, function (errDev, dev) {
          if (errDev) {
            if (errDev.code === 404) {
              console.info("No development branch in " + repo);
            } else {
              console.error(`Error getting development branch for ${user}/${repo}`, errDev);
            }
          } else {
            //console.log(master, dev);
            if (new Date(master.commit.commit.author.date) < new Date(dev.commit.commit.author.date)) {
              console.log(repo, "You should sync master: ", master.commit.commit.author.date, dev.commit.commit.author.date);
            } else {
              console.log(repo, "ok", master.commit.commit.author.date, dev.commit.commit.author.date);
            }
          }
        });
      }
    });
  }

  // Get release note
  program
  .command('release [cmd]')
  .alias('rel')
  .description('Generate the release note')
  .option("-s, --since <date>", "Start date")
  .option("-r, --repo <repo>", "Limit to one directory")
  .option("-u, --user <user>", "User (default cozy,cozy-labs)")
  .action(function (cmd, options) {
    var since, users;
    users = options.user || 'cozy,cozy-labs';
    since = options.since + "T00:00:00Z";
    if (isNaN(Date.parse(since))) {
      console.error("Invalid date " + options.since);
    } else {
      auth();
      async.map(users.split(','), function (user) {
        if (options.repo) {
          displayRepo(user, options.repo, since);
        } else {
          github.repos.getFromOrg({org: user, 'per_page': 100}, function (errGet, repos) {
            if (errGet) {
              console.error(`Error getting repository for ${user} : `, errGet);
            } else {
              repos = repos.filter(function (repo) {
                return !repo.private && !repo.fork;
              });
              repos = repos.map(function (r) {
                r.displayName = ucfirst(r.name.replace(/^cozy-/i, ''));
                return r;
              })
              .sort(function (a, b) {
                return (a.displayName < b.displayName ? -1 : 1);
              });
              async.map(repos, function (repo) {
                displayRepo(user, repo.name, since);
              });
            }
          });
        }
      });
    }
  }).on('--help', function () {
    console.log("    example release --since 2015-08-08");
  });


  // Compare branches
  program
  .command('compare [cmd]')
  .description('Compare master and development branches')
  .option("-r, --repo <repo>", "Limit to one directory")
  .option("-u, --user <user>", "User (default cozy)")
  .action(function (cmd, options) {
    var user;
    user  = options.user || 'cozy';
    auth();
    if (options.repo) {
      compareBranches(user, options.repo);
    } else {
      github.repos.getFromOrg({org: user, 'per_page': 100}, function (errGet, repos) {
        if (errGet) {
          console.error(`Error getting repository for ${user} : `, errGet);
        } else {
          repos = repos.filter(function (repo) {
            return !repo.private && !repo.fork;
          });
          repos = repos.sort(function (a, b) {
            return (a.name < b.name ? -1 : 1);
          });
          async.map(repos, function (repo) {
            compareBranches(user, repo.name);
          });
        }
      });
    }
  });


  // Get all contributors
  program
  .command('contributors')
  .description('Get contributors statistics')
  .option("-u, --user <user>", "User (default cozy")
  .action(function (options) {
    auth();
    getContributors(options.user || 'cozy');
  });

  program.parse(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }

}());
