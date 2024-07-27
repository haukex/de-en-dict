#!/usr/bin/env perl
use 5.036;  # strict and warnings
# Debian/Ubuntu: `sudo apt install libio-socket-ssl-perl`  # depends on libnet-ssleay-perl
use Net::SSLeay 1.49;  # for HTTP::Tiny SSL support
use IO::Socket::SSL 1.42;  # for HTTP::Tiny SSL support
use File::Spec::Functions qw/catfile/;
use IO::Uncompress::Gunzip qw(gunzip $GunzipError);
use Data::Dumper ();
use HTTP::Tiny;
use FindBin;
$|=1;

# This is a script to check the German-English Dictionary formatting.
# (It doesn't do a *full* parse because that would be too difficult.)

sub pp { Data::Dumper->new(\@_)->Terse(1)->Purity(1)->Useqq(1)->Quotekeys(0)->Sortkeys(1)->Indent(0)->Pair('=>')->Dump }

my $DICT_FILE = catfile($FindBin::Bin, 'de-en.txt.gz');
my $DICT_URL = 'https://ftp.tu-chemnitz.de/pub/Local/urz/ding/de-en-devel/de-en.txt.gz';

# Note that single quotes (') are not treated specially because of their varied usage:
# "can't", "hunters' parlance", "height 5' 7''", "x prime /x'/", "f';" (f-prime), and as quotes.

# Note the grammar does not treat "/Abbrev/" specially, because there are too many variations of that,
# e.g. "three eighth / 3/8 /" and "dipped [Br.] / dimmed [Am.] headlights/lights; dipped [Br.] / low [Am.] beam(s)/beam light"

my $LINE_GRAMMAR = qr{
    (?(DEFINE)
        (?<TOKEN>
            (?<LETTER>
                [ a-z A-Z
                \N{LATIN SMALL LETTER A WITH DIAERESIS}
                \N{LATIN SMALL LETTER E WITH DIAERESIS}
                \N{LATIN SMALL LETTER I WITH DIAERESIS}
                \N{LATIN SMALL LETTER O WITH DIAERESIS}
                \N{LATIN SMALL LETTER U WITH DIAERESIS}
                \N{LATIN CAPITAL LETTER A WITH DIAERESIS}
                \N{LATIN CAPITAL LETTER O WITH DIAERESIS}
                \N{LATIN CAPITAL LETTER U WITH DIAERESIS}
                \N{LATIN SMALL LETTER SHARP S}
                \N{LATIN CAPITAL LETTER A WITH ACUTE}
                \N{LATIN CAPITAL LETTER E WITH ACUTE}
                \N{LATIN CAPITAL LETTER I WITH CIRCUMFLEX}
                \N{LATIN SMALL LETTER A WITH ACUTE}
                \N{LATIN SMALL LETTER E WITH ACUTE}
                \N{LATIN SMALL LETTER I WITH ACUTE}
                \N{LATIN SMALL LETTER O WITH ACUTE}
                \N{LATIN SMALL LETTER A WITH GRAVE}
                \N{LATIN SMALL LETTER E WITH GRAVE}
                \N{LATIN SMALL LETTER I WITH GRAVE}
                \N{LATIN SMALL LETTER O WITH GRAVE}
                \N{LATIN SMALL LETTER A WITH CIRCUMFLEX}
                \N{LATIN SMALL LETTER E WITH CIRCUMFLEX}
                \N{LATIN SMALL LETTER I WITH CIRCUMFLEX}
                \N{LATIN SMALL LETTER O WITH CIRCUMFLEX}
                \N{LATIN SMALL LETTER U WITH CIRCUMFLEX}
                \N{LATIN SMALL LETTER A WITH TILDE}
                \N{LATIN SMALL LETTER N WITH TILDE}
                \N{LATIN SMALL LETTER I WITH MACRON}
                \N{LATIN SMALL LETTER C WITH CEDILLA}
                \N{LATIN CAPITAL LETTER S WITH CARON}
                \N{LATIN SMALL LETTER A WITH RING ABOVE}
                \N{LATIN SMALL LETTER AE}
                \N{GREEK SMALL LETTER ALPHA}
                \N{GREEK SMALL LETTER LAMDA}
                \N{GREEK CAPITAL LETTER OMEGA}
            ] )
            | [0-9]

            # ##### ##### Special Sequences ##### #####
            | (?> / \x20 \( \x20 / )     # "left parenthesis / ( /"
            | (?> / [ ) [\] <> {} ] / )  # "left square bracket /[/" etc.
            | (?> \( [<>] \) )           # "greater-than sign (>)" etc.
            | (?> /\\/ ) | (?> \(@\) )   # the only occurrences of @ and \
            | (?> [<>] \x20* [0-9] )     # greater/less than a number
            | (?> \#\ am )               # "(# am Telefon)" (the only occurrence of #)
            | (?> /:-\)/ )               # "Smiley /:-)/"

            # ##### ##### Special Characters ##### #####
            # Note double colon (::), pipe (|), and semicolon (;) are separators that we explicitly don't want to match here.
            # We also treat quotation marks specially.
            | (?!::) [ \x20 ! $ % & + , \- . / : = ? ~
            ' \N{RIGHT SINGLE QUOTATION MARK}
            \N{EN DASH} \N{ACUTE ACCENT} \N{DEGREE SIGN} \N{SECTION SIGN} \N{HORIZONTAL ELLIPSIS} \N{MICRO SIGN}
            \N{SUPERSCRIPT TWO} \N{SUPERSCRIPT THREE} \N{VULGAR FRACTION ONE HALF} \N{MULTIPLICATION SIGN}
            \N{EURO SIGN} \N{CENT SIGN} \N{POUND SIGN} \N{YEN SIGN} \N{COPYRIGHT SIGN} \N{REGISTERED SIGN} ]
        )

        (?<STRING> (
            (?>   \N{LEFT DOUBLE QUOTATION MARK}  ( (?> \( (?&TOKEN)++ \) ) | (?&TOKEN) )++ \N{RIGHT DOUBLE QUOTATION MARK} )  # English style
            | (?> \N{DOUBLE LOW-9 QUOTATION MARK} ( (?> \( (?&TOKEN)++ \) ) | (?&TOKEN) )++ \N{LEFT DOUBLE QUOTATION MARK}  )  # German style
            | (?> " (?&TOKEN)++ " )
            | (?&TOKEN)*+
        )*+ )

        (?<PARENTHESES>  (?> \( (?&STRING) ( ; (?&STRING) )*+ \) )  )
        (?<BRACKETS>     (?> \[ (?&STRING) ( ; (?&STRING) )*+ \] )  )

        (?<BRACES>  (?> \{
            (?<IN_BRACE_STR>  (
                (?> \(  # "to swing {swung (swang [obs.]); swung}"
                    (?<ONLY_BRACKET_STR> ( (?&BRACKETS) | (?&STRING) )* )
                    ( ; (?&ONLY_BRACKET_STR) )*
                \) )
                | (?&BRACKETS)  # "to clothe {clothed, clad [obs.]; clothed, clad [obs.]}"
                | (?&STRING) )*  )
            ( ; (?&IN_BRACE_STR) )*
        \} ) )

        (?<ANGLES>  (?> \<
            (?<IN_ANGLE_STR> (
                (?&PARENTHESES)  # "<after tax (operating) results>"
                | (?&BRACKETS)   # "<pushbike [Br.]>"
                | (?&STRING) )*  )
            ( ; (?&IN_ANGLE_STR) )*+
        \> ) )

        (?<ENTRY>  (?&ANY_BAL_LIST) ( \| (?&ANY_BAL_LIST) )* )
        (?<ANY_BAL_LIST>
            (?<ANY_BAL_STR>  (
                (?> \(
                    (?<IN_PAREN_STR> (
                        (?&PARENTHESES)  # "(formation of erosion hollows in (former) stream beds)"
                        | (?&BRACKETS)   # "Sakko {n} ({m} [Schw.])"
                        | (?&BRACES)     # "Sakko {n} ({m} [Schw.])"
                        | (?&ANGLES)     # "to put through (<> a deal)"
                        | (?&STRING) )*  )
                    ( ; (?&IN_PAREN_STR) )*
                \) )
                | (?&BRACKETS)
                | (?&BRACES)
                | (?&ANGLES)
                | (?&STRING) )*  )
            ( ; (?&ANY_BAL_STR) )*  )
    )
    \A (?<LEFT> (?&ENTRY) ) :: (?<RIGHT> (?&ENTRY) ) \z
}msxxaan;

my $resp = HTTP::Tiny->new->mirror($DICT_URL, $DICT_FILE);
$$resp{success} or die "$DICT_URL $$resp{status} $$resp{reason}".($$resp{status}==599 ? ": $$resp{content}" : '');

gunzip $DICT_FILE => \my $buffer or die "gunzip failed: $GunzipError\n";

open my $fh, '<:raw:encoding(UTF-8)', \$buffer or die $!;
my $fail_cnt = 0;
while (my $line = <$fh>) {
    chomp($line);  # remove trailing newline
    next if $line=~/^\s*#/ || $line!~/\S/;  # skip comments and blank lines

    # ### fix some apparent bugs/typos (TODO: report)
    # missing quote
    $line =~ s{^(?=Eine Nacht auf dem kahlen Berge\x{201c})}{\x{201e}};
    # I assume the following is a mistake that happened on conversion from CP1252 to UTF-8
    $line =~ s{Wiedemann\K\x{0096}(?=Franz)}{\N{EN DASH}};
    # ###

    if ( $line =~ $LINE_GRAMMAR ) {  # parse the line
        my ($de, $en) = ($+{LEFT}, $+{RIGHT});
        my @des = split m/\|/, $de;
        my @ens = split m/\|/, $en;
        @des == @ens or die "Did not get the same number of sub-entries in ".pp($line)."\n";
        #say pp \@des, \@ens;  # debugging, helps visualize runaway regex
    }
    else {
        warn "Failed to parse ".pp($line)."\n";
        die "Aborting after too many failures\n" if ++$fail_cnt>=100;
    }
}
close $fh;
die "$fail_cnt failures\n" if $fail_cnt;
