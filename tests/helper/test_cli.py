import pytest

from helper.cli import main


def test_no_args_prints_help_and_exits_nonzero(capsys):
    assert main([]) == 2
    out = capsys.readouterr()
    assert "tabit" in (out.out + out.err)


def test_version_flag(capsys):
    with pytest.raises(SystemExit) as exc:
        main(["--version"])
    assert exc.value.code == 0
    from engine import __version__
    assert __version__ in capsys.readouterr().out
