# Cozy-hub

Some tools to ease our daily interactions with Github

## Installation

The script need an access token. Follow [this documentation](https://github.com/settings/tokens) to get one, then create a `config.json` file:
```
{
    "token": "xxxx"
}
```


## Usage

`cozhub` will list all available commands. `cozhub cmd --help` lists all options availables for this command.


### Generate release note

```
cozhub release --since 2015-09-01 > note.jade
```

Available options:
 - `--repo cozy-emails` to limit output to one repository;
 - `--user cozy-labs` to list repositories of another user (default is `cozy`).


### List repositories where developtment branch is ahead of master

In fact, this will only compare date of last commit in development and master branches.

```
cozhub compare
```


