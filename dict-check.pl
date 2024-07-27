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

# NOTE there currently is quite a bit of code commented out below relating to single quotes (')
# because it turns out because of the varied usage and typos, it's hard to parse them as balanced quotes.
# This would also result in the regex to run away in some cases, which
# it's not easy to break out of: https://stackoverflow.com/a/23938462
# The commented out code is therefore incomplete and does not work; I may remove it.

# Note the grammar does not treat "/ABBR/" specially, because there are too many variations of that, e.g. "three eighth / 3/8 /"

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

            # see notes above for why this is commented out:
            #| (?<= (?&LETTER) ) ' (?= (?&LETTER) )             # "can't" etc.
            #| (?<= s ) ' (?= \x20 )                            # "hunters' parlance" etc.
            #| (?> (?<= [0-9] ) ''? (?! (?&LETTER) | [0-9] ) )  # "height 5' 7''" etc.
            #| (?<= x ) ' (?= / )                               # "x prime /x'/"
            #| (?<= f ) ' (?= ; )                               # "f';" (f-prime)

            # ##### ##### Special Characters ##### #####
            # Note double colon (::), pipe (|), and semicolon (;) are separators that we explicitly don't want to match here.
            | (?!::) [ \x20 ! $ % & + , \- . / : = ? ~
            ' \N{RIGHT SINGLE QUOTATION MARK}
            \N{EN DASH} \N{ACUTE ACCENT} \N{DEGREE SIGN} \N{SECTION SIGN} \N{HORIZONTAL ELLIPSIS} \N{MICRO SIGN}
            \N{SUPERSCRIPT TWO} \N{SUPERSCRIPT THREE} \N{VULGAR FRACTION ONE HALF} \N{MULTIPLICATION SIGN}
            \N{EURO SIGN} \N{CENT SIGN} \N{POUND SIGN} \N{YEN SIGN} \N{COPYRIGHT SIGN} \N{REGISTERED SIGN} ]

            # ##### ##### Bad Characters ##### #####
            # I assume the following are mistakes that happened on conversion from CP1252 to UTF-8
            | [ \x{0096} ]  # should be \N{EN DASH}
        )

        (?<STRING> (
            (?>   \N{LEFT DOUBLE QUOTATION MARK}  ( (?> \( (?&TOKEN)++ \) ) | (?&TOKEN) )++ \N{RIGHT DOUBLE QUOTATION MARK} )  # English style
            | (?> \N{DOUBLE LOW-9 QUOTATION MARK} ( (?> \( (?&TOKEN)++ \) ) | (?&TOKEN) )++ \N{LEFT DOUBLE QUOTATION MARK}  )  # German style
            # see notes above for why this is commented out:
            #| (?>    ' ( (?> \[ (?&TOKEN)++ \] ) | (?> \( (?&TOKEN)++ \) ) | (?&TOKEN) )+  ' )  # e.g. "'... half two. [Br.]'"
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
die "$DICT_URL $$resp{status} $$resp{reason}".($$resp{status}==599 ? ": $$resp{content}" : '') unless $$resp{success};

gunzip $DICT_FILE => \my $buffer or die "gunzip failed: $GunzipError\n";

open my $fh, '<:raw:encoding(UTF-8)', \$buffer or die $!;
my $fail_cnt = 0;
while (my $line = <$fh>) {
    chomp($line);  # remove trailing newline
    next if $line=~/^\s*#/ || $line!~/\S/;  # skip comments and blank lines

    # ### fix some apparent bugs/typos (TODO: report)
    # (see notes above for why a lot of these are commented out)
    # wrong :: placement
    $line =~ s{\Q(der Nachkriegszeit :: 1950er bis 1960er Jahre) [soc.] baby boom\E}
                {(der Nachkriegszeit: 1950er bis 1960er Jahre) [soc.] :: baby boom};
    # missing '
    #$line =~ s{\Q/ Of course, I can see it!'\E}{/ 'Of course, I can see it!'};
    #$line =~ s{'Hang \(on\) in there!'; \K(?=Don\x{2019}t quit!')}{'};
    #$line =~ s{\| \K(?=Can I put you down for a donation\?')}{'};
    #$line =~ s{\| \K(?=You\x{2019}re always welcome at our house\.')}{'};
    # typo fix * to ' (the only occurrence of *)
    $line =~ s{'When did it happen\?\K\*(?= 'Not that long ago\.')}{'};
    # stray quote
    $line =~ s{molecular mass\K\x{201c}(?= \|)}{};
    $line =~ s{self-perpetuating\K\x{201c}(?= )}{};
    #$line =~ s{:: Perm\K'(?= \(city)}{};
    # bad JS escape
    $line =~ s{'Portnoy\K\\u2019(?=s Complaint')}{\x{2019}};
    # incorrect quote
    $line =~ s{\x{201c}The Magic Flute\K'}{\x{201d}};
    $line =~ s{and the Singers\K\x{201c}(?= Contest at Wartburg Castle)}{\x{2019}};  # I think
    # missing quote
    $line =~ s{^(?=(?:Die brandenburgischen Konzerte|Eine Nacht auf dem kahlen Berge)\x{201c})}{\x{201e}};
    # U+2019 to '
    #$line =~ s{'That depends on the circumstances\K\x{2019}(?= she hedged\.)}{'};
    #$line =~ s{the \K\x{2019}(?=magic of love'\.)}{'};
    #$line =~ s{'shit\K\x{2019}(?=\.)}{'};
    #$line =~ s{He left out an \K\x{2019}(?=m')}{'};
    # double ''
    #$line =~ s{damned if you don\x{2019}t'\K'}{};
    # the following are easier to parse by replacing ' to U+2019 - can the grammar be adjusted instead?
    #$line =~ s{H\x{f6}r\K'(?= doch zu!)}{\x{2019}};
    #$line =~ s{da \K'(?=raus!)}{\x{2019}};
    #$line =~ s{San\K'a'(?= \(capital of Yemen\))}{\x{2019}a\x{2019}};
    #$line =~ s{ \K'(?=tween \(contraction of between\))}{\x{2019}};
    # ###

    if ( $line =~ $LINE_GRAMMAR ) {  # parse the line
        my ($de, $en) = ($+{LEFT}, $+{RIGHT});   # get left (German) and right (English) entries
        my @des = split m/\|/, $de;  # sub-entries are delimited by '|'
        my @ens = split m/\|/, $en;
        # we expect the same number of sub-entries on both sides
        @des == @ens or die "Inconsistent sub-entry count in ".pp($line)."\n";
        #say pp \@des, \@ens;  # debugging, helps visualize runaway regex
    }
    else {
        warn "Failed to parse ".pp($line)."\n";
        die "Aborting after too many failures\n" if ++$fail_cnt>=100;
    }
    warn "Warning: Bad Unicode chars in ".pp($line)."\n" if $line=~/[\x{0096}]/;  #TODO: report
}
close $fh;
die "$fail_cnt failures\n" if $fail_cnt;
